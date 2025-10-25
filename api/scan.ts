import { NextRequest, NextResponse } from 'next/server';

const MAX_RESULTS = 4;
const EVIDENCE_CAP = 10;
const LATENCY_S = 5;
const CONSERVATIVE = true;
const MIN_CITATIONS_SAFE = 2;
const VERDICT_ENUM = ["safe", "caution", "danger"];

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface Evidence {
  title: string;
  url: string;
  content: string;
}

interface TrustReport {
  risk_score: number;
  verdict: string;
  summary: string;
  positives: string[];
  negatives: string[];
  citations: { title: string; url: string }[];
  sources: string[];
}

async function searchTavily(query: string): Promise<TavilyResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      max_results: MAX_RESULTS,
      include_answer: false
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

async function analyzeWithOpenAI(domain: string, evidence: Evidence[]): Promise<TrustReport> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are a strict website risk analyst. Return STRICT JSON only. Use ONLY provided evidence. No hallucinations. Consider fraud/phishing signals, customer complaints, regulatory actions, reputable listings, positive press.'
        },
        {
          role: 'user',
          content: JSON.stringify({ domain, evidence })
        },
        {
          role: 'user',
          content: `Return JSON with fields:
{
  "risk_score": 0-100,
  "verdict": ${JSON.stringify(VERDICT_ENUM)},
  "summary": string,
  "positives": string[],
  "negatives": string[],
  "citations": [{"title": string, "url": string}]
}
- Citations MUST be a subset of the provided evidence.
- If conservative mode is ${CONSERVATIVE}, require at least ${MIN_CITATIONS_SAFE} citations referencing reputable sources to output "safe"; otherwise output "caution".
- If evidence is sparse or conflicting, bias toward "caution".`
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No content in OpenAI response');
  }

  try {
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to parse OpenAI JSON:', content);
    return {
      risk_score: 50,
      verdict: "caution",
      summary: "Insufficient evidence",
      positives: [],
      negatives: [],
      citations: []
    };
  }
}

export async function GET(request: NextRequest) {
  // CORS headers
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get('domain');

  if (!domain) {
    return NextResponse.json(
      { error: "missing domain" },
      { status: 400, headers }
    );
  }

  try {
    // Extract root brand (penultimate label)
    const domainParts = domain.replace(/^www\./, '').split('.');
    const rootBrand = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : domainParts[0];

    // Build search queries
    const queries = [
      `${domain} reviews`,
      `${domain} scam`,
      `site:trustpilot.com ${domain}`,
      `site:reddit.com ${rootBrand}`,
      `${rootBrand} news`
    ];

    // Execute searches with timeout
    const searchPromises = queries.map(query => 
      searchTavily(query).catch(error => {
        console.error(`Search failed for "${query}":`, error);
        return [];
      })
    );

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Search timeout')), LATENCY_S * 1000);
    });

    const searchResults = await Promise.race([
      Promise.all(searchPromises),
      timeoutPromise
    ]).catch(() => {
      console.warn('Search timeout, using partial results');
      return [];
    });

    // Flatten and deduplicate results
    const allResults: TavilyResult[] = [];
    const seenUrls = new Set<string>();

    for (const results of searchResults) {
      for (const result of results) {
        if (!seenUrls.has(result.url) && allResults.length < EVIDENCE_CAP) {
          seenUrls.add(result.url);
          allResults.push({
            title: result.title,
            url: result.url,
            content: result.content?.substring(0, 1000) || ''
          });
        }
      }
    }

    // Analyze with OpenAI
    const report = await analyzeWithOpenAI(domain, allResults);

    // Validate and clamp results
    const riskScore = Math.max(0, Math.min(100, report.risk_score || 50));
    const verdict = VERDICT_ENUM.includes(report.verdict) ? report.verdict : 'caution';

    const finalReport: TrustReport = {
      risk_score: riskScore,
      verdict,
      summary: report.summary || 'Analysis incomplete',
      positives: Array.isArray(report.positives) ? report.positives : [],
      negatives: Array.isArray(report.negatives) ? report.negatives : [],
      citations: Array.isArray(report.citations) ? report.citations : [],
      sources: queries
    };

    return NextResponse.json(finalReport, { headers });

  } catch (error) {
    console.error('Scan error:', error);
    
    const fallbackReport: TrustReport = {
      risk_score: 50,
      verdict: "caution",
      summary: "Analysis failed due to technical error",
      positives: [],
      negatives: [],
      citations: [],
      sources: []
    };

    return NextResponse.json(fallbackReport, { headers });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
