const API_BASE = "https://trust-cap.vercel.app/api/scan";

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

    // Hide help button when starting new scan
    const helpButton = document.getElementById('helpButton');
    if (helpButton) {
      helpButton.classList.remove('show');
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

    // Show fraud badge if no fraud indicators
    const fraudBadge = document.getElementById('fraudBadge');
    const hasFraudIntent = data.evidence?.some(e => 
      e.labels?.fraud_intent?.length > 0
    );
    const hasOnlyDissatisfaction = data.evidence?.some(e => 
      e.labels?.dissatisfaction?.length > 0
    );
    
    if (!hasFraudIntent && hasOnlyDissatisfaction && fraudBadge) {
      fraudBadge.style.display = 'block';
    } else if (fraudBadge) {
      fraudBadge.style.display = 'none';
    }

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

    // Animate trust metrics bars
    animateTrustMetrics(data);

    // Show results
    resultsDiv.style.display = 'block';
    errorDiv.style.display = 'none';
    
    // Show help button after scan is completed
    const helpButton = document.getElementById('helpButton');
    if (helpButton) {
      helpButton.classList.add('show');
    }
  }

  function animateTrustMetrics(data) {
    const metrics = data.radar_metrics || {
      security: 50,
      reputation: 50,
      reviews: 50,
      transparency: 50,
      trustworthiness: 50
    };

    const metricsConfig = [
      { id: 'security', value: metrics.security, label: 'Security' },
      { id: 'reputation', value: metrics.reputation, label: 'Reputation' },
      { id: 'reviews', value: metrics.reviews, label: 'Reviews' },
      { id: 'transparency', value: metrics.transparency, label: 'Transparency' },
      { id: 'trust', value: metrics.trustworthiness, label: 'Trust' }
    ];

    metricsConfig.forEach((metric, index) => {
      const bar = document.getElementById(`${metric.id}Bar`);
      const valueDisplay = document.getElementById(`${metric.id}Value`);
      
      if (bar && valueDisplay) {
        // Determine color class based on score
        let colorClass = 'low';
        if (metric.value >= 75) colorClass = 'excellent';
        else if (metric.value >= 60) colorClass = 'high';
        else if (metric.value >= 40) colorClass = 'medium';
        
        // Remove existing color classes
        bar.classList.remove('low', 'medium', 'high', 'excellent');
        bar.classList.add(colorClass);
        
        // Animate with delay
        setTimeout(() => {
          bar.style.width = `${metric.value}%`;
          
          // Animate number counting up
          animateValue(valueDisplay, 0, metric.value, 1000);
        }, index * 150); // Stagger animation
      }
    });
  }

  function animateValue(element, start, end, duration) {
    const range = end - start;
    const increment = range / (duration / 16); // 60fps
    let current = start;
    
    const timer = setInterval(() => {
      current += increment;
      if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
        current = end;
        clearInterval(timer);
      }
      element.textContent = Math.round(current) + '/100';
    }, 16);
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

  // Help Button Functionality
  const helpButton = document.getElementById('helpButton');
  const modalOverlay = document.getElementById('modalOverlay');
  const typingIndicator = document.getElementById('typingIndicator');
  const modalText = document.getElementById('modalText');
  const confirmationToast = document.getElementById('confirmationToast');

  helpButton.addEventListener('click', () => {
    // Show modal with animation
    modalOverlay.classList.add('show');
    
    // Show typing indicator for 2-3 seconds
    typingIndicator.style.display = 'flex';
    modalText.style.opacity = '0';
    
    // After 2.5 seconds, hide typing indicator and show text
    setTimeout(() => {
      typingIndicator.style.display = 'none';
      modalText.classList.add('show');
    }, 2500);
    
    // After 10 seconds total, hide modal and show confirmation toast
    setTimeout(() => {
      modalOverlay.classList.remove('show');
      modalText.classList.remove('show');
      typingIndicator.style.display = 'flex';
      
      // Show confirmation toast
      setTimeout(() => {
        confirmationToast.classList.add('show');
        
        // Hide toast after 3 seconds
        setTimeout(() => {
          confirmationToast.classList.remove('show');
        }, 3000);
      }, 500);
    }, 10000);
  });

  // Close modal when clicking outside
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove('show');
      modalText.classList.remove('show');
      typingIndicator.style.display = 'flex';
    }
  });
});
