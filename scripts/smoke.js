#!/usr/bin/env node
/**
 * Smoke test script for TrustTap API
 * Tests the /api/scan endpoint with stripe.com
 */

const https = require('https');
const http = require('http');

// Configuration
const TEST_DOMAIN = 'stripe.com';
const TIMEOUT_MS = 7000; // 7 seconds (LATENCY_S + 2)
const API_BASE = process.env.API_BASE || 'http://localhost:3000';

async function testAPI() {
  console.log('🧪 TrustTap API Smoke Test');
  console.log('========================');
  console.log(`Testing domain: ${TEST_DOMAIN}`);
  console.log(`API Base: ${API_BASE}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log('');

  const startTime = Date.now();
  
  try {
    const url = `${API_BASE}/api/scan?domain=${encodeURIComponent(TEST_DOMAIN)}`;
    console.log(`📡 Making request to: ${url}`);
    
    const response = await fetchWithTimeout(url, TIMEOUT_MS);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Response received in ${duration}ms`);
    console.log(`📊 Status: ${response.status} ${response.statusText}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('');
      console.log('📋 Response Data:');
      console.log('================');
      console.log(`Risk Score: ${data.risk_score}`);
      console.log(`Verdict: ${data.verdict}`);
      console.log(`Summary: ${data.summary}`);
      console.log(`Positives: ${data.positives?.length || 0} items`);
      console.log(`Negatives: ${data.negatives?.length || 0} items`);
      console.log(`Citations: ${data.citations?.length || 0} items`);
      
      // Validate response structure
      const requiredFields = ['risk_score', 'verdict', 'summary', 'positives', 'negatives', 'citations'];
      const missingFields = requiredFields.filter(field => !(field in data));
      
      if (missingFields.length > 0) {
        console.log(`❌ Missing required fields: ${missingFields.join(', ')}`);
        process.exit(1);
      }
      
      // Validate verdict
      const validVerdicts = ['safe', 'caution', 'danger'];
      if (!validVerdicts.includes(data.verdict)) {
        console.log(`❌ Invalid verdict: ${data.verdict}. Must be one of: ${validVerdicts.join(', ')}`);
        process.exit(1);
      }
      
      // Validate risk score
      if (typeof data.risk_score !== 'number' || data.risk_score < 0 || data.risk_score > 100) {
        console.log(`❌ Invalid risk_score: ${data.risk_score}. Must be a number between 0-100`);
        process.exit(1);
      }
      
      console.log('');
      console.log('✅ All validations passed!');
      console.log('🎉 API is working correctly');
      
    } else {
      console.log(`❌ API returned error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.log(`Error details: ${errorText}`);
      process.exit(1);
    }
    
  } catch (error) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`❌ Test failed after ${duration}ms`);
    console.log(`Error: ${error.message}`);
    
    if (error.name === 'TimeoutError') {
      console.log('💡 Tip: Check if the API server is running and accessible');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('💡 Tip: Make sure the API server is running on the correct port');
    }
    
    process.exit(1);
  }
}

function fetchWithTimeout(url, timeout) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'TrustTap-SmokeTest/1.0'
      }
    }, (res) => {
      resolve(res);
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.on('timeout', () => {
      req.destroy();
      const timeoutError = new Error('Request timeout');
      timeoutError.name = 'TimeoutError';
      reject(timeoutError);
    });
    
    req.setTimeout(timeout);
    req.end();
  });
}

// Run the test
if (require.main === module) {
  testAPI().catch((error) => {
    console.error('💥 Test runner error:', error);
    process.exit(1);
  });
}

module.exports = { testAPI };
