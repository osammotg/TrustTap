const API_BASE = "https://trust-cap.vercel.app/api/scan";

let radarChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  const domainInput = document.getElementById('domain');
  const scanBtn = document.getElementById('scanBtn');
  const spinner = document.getElementById('spinner');
  const errorDiv = document.getElementById('error');
  const loadingDiv = document.getElementById('loading');
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

    // Disable button and show loading animation
    scanBtn.disabled = true;
    scanBtn.textContent = 'Scanning...';
    spinner.style.display = 'block';
    errorDiv.style.display = 'none';
    resultsDiv.style.display = 'none';
    loadingDiv.style.display = 'block';
    
    // Start loading animation
    startLoadingAnimation(domain);

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
      // Re-enable button and hide loading animation
      scanBtn.disabled = false;
      scanBtn.textContent = 'Scan';
      spinner.style.display = 'none';
      loadingDiv.style.display = 'none';
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

    // Create radar chart (with fallback for Chart.js loading)
    if (typeof Chart !== 'undefined') {
      createRadarChart(data);
    } else {
      // Wait for Chart.js to load
      const checkChart = setInterval(() => {
        if (typeof Chart !== 'undefined') {
          clearInterval(checkChart);
          createRadarChart(data);
        }
      }, 100);
      
      // Timeout after 5 seconds
      setTimeout(() => {
        clearInterval(checkChart);
        console.error('Chart.js failed to load');
      }, 5000);
    }

    // Show results
    resultsDiv.style.display = 'block';
    errorDiv.style.display = 'none';
  }

  function createRadarChart(data) {
    console.log('=== CHART DEBUG START ===');
    console.log('Chart.js available:', typeof Chart !== 'undefined');
    console.log('Data received:', data);
    console.log('Radar metrics:', data.radar_metrics);

    // Always show fallback first
    const metrics = data.radar_metrics || {
      security: 50,
      reputation: 50,
      reviews: 50,
      transparency: 50,
      trustworthiness: 50
    };

    // Show fallback immediately
    showRadarFallback(metrics);

    // Try to create chart if Chart.js is available
    if (typeof Chart === 'undefined') {
      console.error('Chart.js not loaded - using fallback only');
      return;
    }

    const radarCanvas = document.getElementById('radarChart');
    if (!radarCanvas) {
      console.error('Radar chart canvas not found');
      return;
    }

    try {
      // Destroy existing chart
      if (radarChart) radarChart.destroy();

      console.log('Creating radar chart...');
      
      radarChart = new Chart(radarCanvas, {
        type: 'radar',
        data: {
          labels: ['Security', 'Reputation', 'Reviews', 'Transparency', 'Trust'],
          datasets: [{
            label: 'Trust Assessment',
            data: [
              metrics.security,
              metrics.reputation,
              metrics.reviews,
              metrics.transparency,
              metrics.trustworthiness
            ],
            backgroundColor: 'rgba(255, 0, 0, 0.3)',
            borderColor: 'rgba(255, 0, 0, 1)',
            borderWidth: 3,
            pointBackgroundColor: 'rgba(255, 0, 0, 1)',
            pointBorderColor: '#fff',
            pointRadius: 6,
            pointHoverRadius: 8
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              beginAtZero: true,
              max: 100,
              ticks: {
                stepSize: 20,
                color: '#000',
                font: { size: 12, weight: 'bold' }
              },
              pointLabels: {
                color: '#000',
                font: { size: 14, weight: 'bold' }
              },
              grid: {
                color: '#000'
              },
              angleLines: {
                color: '#000'
              }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });

      console.log('Chart created successfully');
      
      // Hide fallback if chart works
      setTimeout(() => {
        const fallback = document.getElementById('radarFallback');
        if (fallback && radarChart) {
          fallback.style.display = 'none';
        }
      }, 1000);

    } catch (error) {
      console.error('Chart creation failed:', error);
    }

    console.log('=== CHART DEBUG END ===');
  }

  function showRadarFallback(metrics) {
    const canvas = document.getElementById('radarChart');
    const fallback = document.getElementById('radarFallback');
    const scoresContainer = document.getElementById('radarScores');
    
    if (canvas) canvas.style.display = 'none';
    if (fallback) fallback.style.display = 'block';
    
    if (scoresContainer) {
      scoresContainer.innerHTML = '';
      const scoreItems = [
        { label: '🛡️ Security', value: metrics.security },
        { label: '⭐ Reputation', value: metrics.reputation },
        { label: '📝 Reviews', value: metrics.reviews },
        { label: '🔍 Transparency', value: metrics.transparency },
        { label: '✅ Trust', value: metrics.trustworthiness }
      ];
      
      scoreItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'score-item';
        div.innerHTML = `
          <span class="score-label">${item.label}</span>
          <span class="score-value">${item.value}/100</span>
        `;
        scoresContainer.appendChild(div);
      });
    }
  }

  function getRiskColor(score) {
    if (score <= 30) return '#28a745'; // Green
    if (score <= 70) return '#ffc107'; // Yellow
    return '#dc3545'; // Red
  }

  function startLoadingAnimation(domain) {
    const scanItems = [
      { id: 'scanItem1', text: 'Initializing analysis...', delay: 0 },
      { id: 'scanItem2', text: `Scanning ${domain} reviews...`, delay: 1000 },
      { id: 'scanItem3', text: 'Searching Trustpilot & Reddit...', delay: 2000 },
      { id: 'scanItem4', text: 'AI analyzing evidence...', delay: 3000 }
    ];

    const progressFill = document.getElementById('progressFill');
    const loadingStatus = document.getElementById('loadingStatus');
    
    let currentStep = 0;
    const totalSteps = scanItems.length;
    
    // Reset all scan items
    scanItems.forEach(item => {
      const element = document.getElementById(item.id);
      element.style.display = 'none';
      element.style.opacity = '0';
      element.style.transform = 'translateX(-20px)';
    });

    // Animate each step
    scanItems.forEach((item, index) => {
      setTimeout(() => {
        const element = document.getElementById(item.id);
        element.style.display = 'flex';
        element.style.animation = 'slideIn 0.5s ease-out forwards';
        
        // Update progress
        currentStep++;
        const progress = (currentStep / totalSteps) * 100;
        progressFill.style.width = `${progress}%`;
        loadingStatus.textContent = item.text;
        
        // Add pulsing effect to current item
        element.style.animation = 'slideIn 0.5s ease-out forwards, pulse 1s ease-in-out infinite';
        
        // Remove pulsing from previous items
        if (index > 0) {
          const prevElement = document.getElementById(scanItems[index - 1].id);
          prevElement.style.animation = 'slideIn 0.5s ease-out forwards';
        }
      }, item.delay);
    });

    // Add pulse animation for current item
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
    `;
    document.head.appendChild(style);
  }
});
