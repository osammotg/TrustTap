import { NextRequest, NextResponse } from 'next/server';

const EVIDENCE_CAP = 12;
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

interface RadarMetrics {
  security: number;
  reputation: number;
  reviews: number;
  transparency: number;
  trustworthiness: number;
}

interface TrustReport {
  risk_score: number;
  verdict: string;
  summary: string;
  positives: string[];
  negatives: string[];
  citations: { title: string; url: string }[];
  sources: string[];
  radar_metrics: RadarMetrics;
  evidence?: any[];
  aggregates?: any;
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
      max_results: 3, // 3 per query
      include_answer: false
    })
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json();
  return data.results || [];
}

// Enrich evidence with metadata
function enrichEvidence(evidence: Evidence[], targetDomain: string) {
  return evidence.map(e => {
    const url = new URL(e.url);
    const hostname = url.hostname;
    
    // Guess source_type
    let source_type = 'other';
    if (/trustpilot|g2|capterra|yelp|tripadvisor/.test(hostname)) source_type = 'reviews';
    else if (/reddit|quora|forum/.test(hostname)) source_type = 'forum';
    else if (/news|journalism|press/.test(hostname) || /\.news|cnn|bbc|reuters/.test(hostname)) source_type = 'news';
    else if (/bbb\.org|ftc\.gov|sec\.gov/.test(hostname)) source_type = 'regulator';
    else if (/press-release|pr\.com|newswire/.test(hostname || e.content.toLowerCase())) source_type = 'press';
    
    // Best-effort rating/review_count parsing
    let rating: number | null = null;
    let review_count: number | null = null;
    
    const ratingMatch = e.content.match(/(\d\.\d)\s*(out of|\/)\s*5|rating[:\s]+(\d\.\d)/i);
    if (ratingMatch) rating = parseFloat(ratingMatch[1] || ratingMatch[3]);
    
    const reviewMatch = e.content.match(/(\d{1,3}(?:,\d{3})*)\s*reviews?/i);
    if (reviewMatch) review_count = parseInt(reviewMatch[1].replace(/,/g, ''));
    
    return {
      ...e,
      domain: hostname,
      source_type,
      rating,
      review_count
    };
  });
}

function calculateRadarMetrics(report: any, evidence: Evidence[], riskScore: number): RadarMetrics {
  const positiveCount = report.positives?.length || 0;
  const negativeCount = report.negatives?.length || 0;
  const citationCount = report.citations?.length || 0;
  const evidenceCount = evidence.length;
  
  // Security: inverse of risk score, boosted if no scam mentions
  const scamMentions = evidence.filter(e => 
    e.content.toLowerCase().includes('scam') || 
    e.content.toLowerCase().includes('fraud') ||
    e.content.toLowerCase().includes('phishing')
  ).length;
  const security = Math.max(0, Math.min(100, 100 - riskScore - (scamMentions * 5)));
  
  // Reputation: based on positive vs negative ratio
  const totalSentiment = positiveCount + negativeCount;
  const reputation = totalSentiment > 0 
    ? Math.round((positiveCount / totalSentiment) * 100)
    : 50;
  
  // Reviews: based on number of review sources found
  const reviewSources = evidence.filter(e =>
    e.url.includes('trustpilot') ||
    e.url.includes('reddit') ||
    e.content.toLowerCase().includes('review')
  ).length;
  const reviews = Math.min(100, reviewSources * 20);
  
  // Transparency: based on citations and evidence quality
  const transparency = Math.min(100, (citationCount * 25) + (evidenceCount * 5));
  
  // Trustworthiness: inverse of risk score
  const trustworthiness = Math.max(0, 100 - riskScore);
  
  return {
    security,
    reputation,
    reviews,
    transparency,
    trustworthiness
  };
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
          content: 'You are a strict website risk analyst. Return STRICT JSON only. Use ONLY provided evidence. No hallucinations. Classify dissatisfaction separately from fraud intent. Do NOT mark a site as "danger" without ≥2 independent fraud-intent sources or a regulator warning. If evidence is mostly dissatisfaction and no fraud-intent, cap verdict at "caution". Consider positive signals (ratings ≥4.3 with large review_count, reputable press/partnerships) as risk reducers.'
        },
        {
          role: 'user',
          content: JSON.stringify({ domain, evidence })
        },
        {
          role: 'user',
          content: `Return JSON with exact structure:
{
  "risk_score": 0-100,
  "verdict": ${JSON.stringify(VERDICT_ENUM)},
  "summary": string,
  "positives": string[],
  "negatives": string[],
  "citations": [{"title": string, "url": string}],
  "evidence": [
    {
      "title": string, "url": string, "snippet": string, "domain": string,
      "source_type": "reviews"|"forum"|"news"|"regulator"|"press"|"other",
      "stance": "negative"|"neutral"|"positive",
      "rationale": string,
      "credibility": number (0..1),
      "rating": number|null (0..5 if parseable),
      "review_count": number|null,
      "labels": {
        "fraud_intent": string[] (from: phishing, non_delivery, unauthorized_charge, impersonation, counterfeit, chargeback_spike),
        "dissatisfaction": string[] (from: slow_shipping, poor_support, refund_delay, high_price, UX_issues)
      }
    }
  ],
  "aggregates": {
    "stance_counts": { "negative": number, "neutral": number, "positive": number }
  }
}
Rules:
- Use ONLY supplied evidence. No hallucinations.
- Classify dissatisfaction separately from fraud intent.
- Do NOT mark "danger" without ≥2 independent fraud-intent sources OR regulator warning.
- If mostly dissatisfaction + no fraud-intent, cap at "caution".
- Positive signals reduce risk.`
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

    // Build search queries: fraud-intent + positive-balance
    const queries = [
      `${domain} fraud`,
      `${domain} phishing`,
      `${domain} unauthorized charge`,
      `${domain} never received`,
      `${domain} counterfeit`,
      `${domain} chargeback`,
      `${domain} bbb complaints`,
      `${domain} awards`,
      `${domain} case study`,
      `${domain} partnership`,
      `${domain} press release`,
      `site:trustpilot.com ${domain}`,
      `site:reddit.com ${rootBrand}`
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

    // Enrich evidence before analysis
    const enrichedEvidence = enrichEvidence(allResults, domain);

    // Analyze with OpenAI
    const report = await analyzeWithOpenAI(domain, enrichedEvidence);

    // Post-process: fraud-only risk scoring
    const fraudCount = report.evidence?.filter((e: any) => 
      e.labels?.fraud_intent?.length > 0
    ).length || 0;
    
    const hasRegulatorWarning = report.evidence?.some((e: any) => 
      e.source_type === 'regulator' && e.stance === 'negative'
    ) || false;
    
    let adjustedRisk = report.risk_score || 50;
    let adjustedVerdict = report.verdict || 'caution';
    
    // DANGER only if: raw≥60 AND (≥2 fraud-intent OR regulator warning)
    if (adjustedRisk >= 60 && (fraudCount >= 2 || hasRegulatorWarning)) {
      adjustedVerdict = 'danger';
    }
    // SAFE only if: raw≤25 AND zero fraud-intent AND ≥2 credible sources
    else if (adjustedRisk <= 25 && fraudCount === 0 && (report.evidence?.length || 0) >= 2) {
      adjustedVerdict = 'safe';
    }
    // Otherwise CAUTION
    else {
      adjustedVerdict = 'caution';
      // Cap risk if only dissatisfaction, no fraud
      if (fraudCount === 0) {
        adjustedRisk = Math.min(adjustedRisk, 50);
      }
    }

    const riskScore = Math.max(0, Math.min(100, adjustedRisk));
    const verdict = VERDICT_ENUM.includes(adjustedVerdict) ? adjustedVerdict : 'caution';

    // Calculate radar metrics
    const radarMetrics = calculateRadarMetrics(report, allResults, riskScore);

    const finalReport: TrustReport = {
      risk_score: riskScore,
      verdict,
      summary: report.summary || 'Analysis incomplete',
      positives: Array.isArray(report.positives) ? report.positives : [],
      negatives: Array.isArray(report.negatives) ? report.negatives : [],
      citations: Array.isArray(report.citations) ? report.citations : [],
      sources: queries,
      radar_metrics: radarMetrics,
      evidence: report.evidence || [],
      aggregates: report.aggregates || { stance_counts: { negative: 0, neutral: 0, positive: 0 } }
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
      sources: [],
      radar_metrics: {
        security: 50,
        reputation: 50,
        reviews: 50,
        transparency: 50,
        trustworthiness: 50
      },
      evidence: [],
      aggregates: { stance_counts: { negative: 0, neutral: 0, positive: 0 } }
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
