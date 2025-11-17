#!/usr/bin/env node

import { spawn } from 'child_process';
import fetch from 'node-fetch';

async function testWebUI() {
  console.log('🧪 Testing Web UI functionality...');

  // Start the server
  console.log('🚀 Starting server...');
  const serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let serverReady = false;
  let webUIUrl = '';

  // Wait for server to be ready
  await new Promise((resolve) => {
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.log('Server output:', output.trim());

      if (output.includes('MCP server connected and ready') && !serverReady) {
        serverReady = true;
        console.log('✅ MCP server ready');
      }

      if (output.includes('Web UI available at')) {
        const urlMatch = output.match(/http:\/\/localhost:\d+/);
        if (urlMatch) {
          webUIUrl = urlMatch[0];
          console.log('✅ Web UI URL found:', webUIUrl);
        }
      }

      if (output.includes('Database not initialized')) {
        console.log('✅ Server correctly detected uninitialized database');
        resolve();
      }
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      console.log('⏰ Timeout waiting for server');
      resolve();
    }, 10000);
  });

  if (!webUIUrl) {
    console.error('❌ Web UI URL not found');
    serverProcess.kill();
    process.exit(1);
  }

  // Test the init page
  try {
    console.log('🌐 Testing init page...');
    const initResponse = await fetch(`${webUIUrl}/`);
    const initText = await initResponse.text();

    if (initResponse.ok && initText.includes('Initialization Required')) {
      console.log('✅ Init page loads correctly');
    } else {
      console.log('❌ Init page not working properly');
    }

    // Test the status API
    console.log('🔍 Testing status API...');
    const statusResponse = await fetch(`${webUIUrl}/api/status`);
    const statusData = await statusResponse.json();

    if (statusData.initialized === false) {
      console.log('✅ Status API correctly reports uninitialized database');
    } else {
      console.log('❌ Status API not working correctly');
    }

  } catch (error) {
    console.error('❌ Error testing web UI:', error.message);
  }

  // Clean up
  console.log('🧹 Cleaning up...');
  serverProcess.kill();
  console.log('✅ Web UI test completed');
}

// Run the test
testWebUI().catch(console.error);