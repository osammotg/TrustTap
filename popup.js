const API_BASE = "https://trust-cap.vercel.app/api/scan";

let riskChart = null;
let stanceChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const domainInput = document.getElementById('domain');
  const scanBtn = document.getElementById('scanBtn');
  const spinner = document.getElementById('spinner');
  const errorDiv = document.getElementById('error');
  const resultsDiv = document.getElementById('results');

  // Get current tab domain
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      const url = new URL(tab.url);
      let hostname = url.hostname;
      
      // Remove www. prefix
      if (hostname.startsWith('www.')) {
        hostname = hostname.substring(4);
      }
      
      domainInput.value = hostname;
    }
  } catch (error) {
    console.error('Failed to get current tab:', error);
    domainInput.value = '';
  }

  scanBtn.addEventListener('click', async () => {
    const domain = domainInput.value.trim();
    
    if (!domain) {
      showError('Please enter a domain to analyze');
      return;
    }

    // Disable button and show spinner
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';
    spinner.style.display = 'block';
    errorDiv.style.display = 'none';
    resultsDiv.style.display = 'none';

    try {
      const response = await fetch(`${API_BASE}?domain=${encodeURIComponent(domain)}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      displayResults(data);

    } catch (error) {
      console.error('Scan failed:', error);
      showError(`Scan failed: ${error.message}`);
    } finally {
      // Re-enable button and hide spinner
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan';
      spinner.style.display = 'none';
    }
  });

  function showError(message) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
  }

  function displayResults(data) {
    // Update score and verdict
    const scoreEl = document.getElementById('score');
    const verdictEl = document.getElementById('verdict');
    
    scoreEl.textContent = data.risk_score || '--';
    verdictEl.textContent = (data.verdict || 'caution').toUpperCase();
    verdictEl.className = `verdict ${data.verdict || 'caution'}`;

    // Update summary
    const summaryEl = document.getElementById('summary');
    summaryEl.textContent = data.summary || 'No summary available';

    // Update negatives
    const negListEl = document.getElementById('negList');
    negListEl.innerHTML = '';
    if (data.negatives && data.negatives.length > 0) {
      data.negatives.forEach(negative => {
        const li = document.createElement('li');
        li.textContent = negative;
        negListEl.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No red flags detected';
      li.style.color = '#28a745';
      negListEl.appendChild(li);
    }

    // Update positives
    const posListEl = document.getElementById('posList');
    posListEl.innerHTML = '';
    if (data.positives && data.positives.length > 0) {
      data.positives.forEach(positive => {
        const li = document.createElement('li');
        li.textContent = positive;
        posListEl.appendChild(li);
      });
    } else {
      const li = document.createElement('li');
      li.textContent = 'No positive signals found';
      li.style.color = '#666';
      posListEl.appendChild(li);
    }

    // Update citations
    const citationsEl = document.getElementById('citations');
    citationsEl.innerHTML = '';
    if (data.citations && data.citations.length > 0) {
      data.citations.forEach(citation => {
        const a = document.createElement('a');
        a.href = citation.url;
        a.textContent = citation.title;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        citationsEl.appendChild(a);
      });
    } else {
      const div = document.createElement('div');
      div.textContent = 'No citations available';
      div.style.color = '#666';
      div.style.fontSize = '12px';
      citationsEl.appendChild(div);
    }

    // Update sources
    const sourcesListEl = document.getElementById('sourcesList');
    const sourcesToggle = document.getElementById('sourcesToggle');

    if (data.sources && data.sources.length > 0) {
      sourcesListEl.innerHTML = '';
      data.sources.forEach(source => {
        const div = document.createElement('div');
        div.textContent = source;
        sourcesListEl.appendChild(div);
      });
      
      // Toggle functionality
      sourcesToggle.addEventListener('click', () => {
        sourcesListEl.classList.toggle('expanded');
        sourcesToggle.textContent = sourcesListEl.classList.contains('expanded')
          ? 'Search Queries Used ▲'
          : 'Search Queries Used ▼';
      });
    }

    // Create charts
    createCharts(data);

    // Show results
    resultsDiv.style.display = 'block';
    errorDiv.style.display = 'none';
  }

  function createCharts(data) {
    // Destroy existing charts
    if (riskChart) riskChart.destroy();
    if (stanceChart) stanceChart.destroy();

    // Risk Score Donut Chart
    const riskCtx = document.getElementById('riskChart').getContext('2d');
    const riskScore = data.risk_score || 0;
    const riskRemaining = 100 - riskScore;
    
    riskChart = new Chart(riskCtx, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [riskScore, riskRemaining],
          backgroundColor: [
            getRiskColor(riskScore),
            '#e9ecef'
          ],
          borderWidth: 0,
          cutout: '70%'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false }
        }
      }
    });

    // Stance Analysis Bar Chart
    const stanceCtx = document.getElementById('stanceChart').getContext('2d');
    const negatives = data.negatives?.length || 0;
    const positives = data.positives?.length || 0;
    const neutral = Math.max(0, 5 - negatives - positives); // Assume max 5 items total
    
    stanceChart = new Chart(stanceCtx, {
      type: 'bar',
      data: {
        labels: ['Negative', 'Neutral', 'Positive'],
        datasets: [{
          data: [negatives, neutral, positives],
          backgroundColor: ['#dc3545', '#6c757d', '#28a745'],
          borderWidth: 0,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: function(context) {
                return context.parsed.y + ' items';
              }
            }
          }
        },
        scales: {
          x: { display: false },
          y: { 
            display: false,
            beginAtZero: true,
            max: 5
          }
        }
      }
    });
  }

  function getRiskColor(score) {
    if (score <= 30) return '#28a745'; // Green
    if (score <= 70) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  }
});
