# TrustTap — Real-time Site Reputation

A Chrome MV3 extension that analyzes website reputation and trustworthiness in real-time using web search and AI analysis.

## Features

- **Real-time Analysis**: Get instant trust reports for any website
- **AI-Powered**: Uses GPT-4o-mini for intelligent risk assessment
- **Evidence-Based**: Searches multiple sources including Trustpilot, Reddit, and news
- **Conservative Mode**: Requires multiple citations for "safe" verdicts
- **Fast**: 5-second latency target with timeout handling

## Quick Setup

### 1. Deploy Backend to Vercel

1. **Fork/Clone this repository**
2. **Connect to Vercel**:
   ```bash
   npm install -g vercel
   vercel login
   vercel --prod
   ```

3. **Set Environment Variables** in Vercel dashboard:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `TAVILY_API_KEY`: Your Tavily API key

4. **Copy the deployment URL** (e.g., `https://your-project.vercel.app`)

### 2. Configure Extension

1. **Update API endpoint** in `popup.js`:
   ```javascript
   const API_BASE = "https://your-project.vercel.app/api/scan";
   ```

2. **Load extension in Chrome**:
   - Open `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the project folder

### 3. Test the Setup

Run the smoke test to verify everything works:

```bash
# Test with local development
API_BASE=http://localhost:3000 node scripts/smoke.js

# Test with deployed API
API_BASE=https://your-project.vercel.app node scripts/smoke.js
```

## API Endpoint

### GET /api/scan?domain=<domain>

Returns a JSON trust report:

```json
{
  "risk_score": 25,
  "verdict": "safe",
  "summary": "Stripe is a well-established payment processor...",
  "positives": [
    "Trusted by major companies",
    "SOC 2 compliant"
  ],
  "negatives": [],
  "citations": [
    {
      "title": "Stripe Reviews on Trustpilot",
      "url": "https://trustpilot.com/review/stripe.com"
    }
  ]
}
```

**Parameters:**
- `domain` (required): Domain to analyze (e.g., "stripe.com")

**Response Fields:**
- `risk_score`: 0-100 (higher = riskier)
- `verdict`: "safe", "caution", or "danger"
- `summary`: Human-readable analysis
- `positives`: Array of positive signals
- `negatives`: Array of red flags
- `citations`: Array of source links

## Configuration

The system uses these environment variables:

- `OPENAI_API_KEY`: OpenAI API key for GPT-4o-mini
- `TAVILY_API_KEY`: Tavily API key for web search

## Technical Details

### Search Strategy
- Searches for: `{domain} reviews`, `{domain} scam`, `site:trustpilot.com {domain}`, `site:reddit.com {rootBrand}`, `{rootBrand} news`
- Limits: 4 results per query, 10 total evidence cap
- Timeout: 5 seconds with graceful degradation

### Conservative Mode
- Requires ≥2 citations from reputable sources for "safe" verdict
- Defaults to "caution" when evidence is sparse
- Bias toward caution for conflicting information

### Extension Features
- Auto-detects current tab domain
- Real-time analysis with loading states
- Clickable citations that open in new tabs
- Responsive design (320px width)

## Development

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Test API
node scripts/smoke.js
```

### Project Structure

```
TrustCap/
├── api/
│   └── scan.ts              # Main API endpoint
├── icons/                   # Extension icons
│   ├── 16.png
│   ├── 48.png
│   └── 128.png
├── scripts/
│   └── smoke.js             # API test script
├── manifest.json            # Chrome extension manifest
├── popup.html              # Extension popup UI
├── popup.js                # Extension logic
├── package.json            # Dependencies
├── vercel.json             # Vercel configuration
└── tsconfig.json           # TypeScript config
```

## Troubleshooting

### Common Issues

1. **API returns 500 errors**:
   - Check environment variables are set in Vercel
   - Verify API keys are valid and have sufficient credits

2. **Extension shows "Scan failed"**:
   - Update `API_BASE` in `popup.js` with correct Vercel URL
   - Check browser console for detailed error messages

3. **Slow responses**:
   - Normal for first requests (cold start)
   - Subsequent requests should be faster
   - Check Vercel function logs for timeouts

### Testing

The smoke test validates:
- API response time (< 7 seconds)
- Required JSON fields
- Valid verdict values
- Risk score range (0-100)

## License

MIT License - see LICENSE file for details.

## Disclaimer

**Advisory only. Verify sources.** This tool provides automated analysis based on web search results. Always verify information through official sources before making decisions.
