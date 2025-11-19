#!/usr/bin/env node

import { spawn } from 'child_process';
import fetch from 'node-fetch';

async function testBrowserAutoOpen() {
  console.log('🧪 Testing Browser Auto-Open functionality...');

  // Start the server
  console.log('🚀 Starting server...');
  const serverProcess = spawn('npx', ['tsx', 'server.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd()
  });

  let serverReady = false;
  let webUIUrl = '';
  let mcpReady = false;

  // Wait for both MCP and HTTP servers to be ready
  await new Promise((resolve) => {
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString();
      console.log('Server output:', output.trim());

      if (output.includes('MCP server connected and ready') && !mcpReady) {
        mcpReady = true;
        console.log('✅ MCP server ready');
      }

      if (output.includes('Web UI available at')) {
        const urlMatch = output.match(/http:\/\/localhost:\d+/);
        if (urlMatch) {
          webUIUrl = urlMatch[0];
          console.log('✅ Web UI URL found:', webUIUrl);
        }
      }

      if (output.includes('Database not initialized') && webUIUrl) {
        console.log('✅ Server correctly detected uninitialized database');
        resolve();
      }
    });

    // Timeout after 15 seconds
    setTimeout(() => {
      console.log('⏰ Timeout waiting for server');
      resolve();
    }, 15000);
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

    // Test manual browser opening
    console.log('🖱️  Testing manual browser opening...');
    const openResponse = await fetch(`${webUIUrl}/open-browser`);
    const openResult = await openResponse.json();

    console.log('Manual browser open result:', openResult);

  } catch (error) {
    console.error('❌ Error testing web UI:', error.message);
  }

  // Clean up
  console.log('🧹 Cleaning up...');
  serverProcess.kill();
  console.log('✅ Browser auto-open test completed');
}

// Run the test
testBrowserAutoOpen().catch(console.error);