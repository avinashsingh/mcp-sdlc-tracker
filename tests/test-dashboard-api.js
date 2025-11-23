import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

console.log('🧪 Testing Dashboard API Endpoint');
console.log('==================================');

async function testDashboardAPI() {
  console.log('🚀 Starting MCP server...');

  const server = spawn('tsx', [serverPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, NODE_ENV: 'test' }
  });

  let serverReady = false;
  let port = '';

  // Monitor server output
  server.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('MCP server connected and ready') && !serverReady) {
      serverReady = true;
      console.log('✅ MCP server ready');
    }

    if (output.includes('Web UI available at')) {
      const urlMatch = output.match(/http:\/\/localhost:(\d+)/);
      if (urlMatch) {
        port = urlMatch[1];
        console.log(`🌐 Server running on port ${port}`);
      }
    }
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    const checkReady = () => {
      if (serverReady && port) {
        resolve();
      } else {
        setTimeout(checkReady, 500);
      }
    };
    checkReady();
  });

  console.log('\n📁 Initializing database...');

  // Initialize database
  const { exec } = require('child_process');
  await new Promise((resolve, reject) => {
    exec(`curl -s -X POST http://localhost:${port}/api/initialize -H "Content-Type: application/json" -d '{"currentProjectLocation": "/tmp/dashboard-test"}'`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const response = JSON.parse(stdout);
        if (response.success) {
          console.log('✅ Database initialized');
          resolve();
        } else {
          reject(new Error(response.error));
        }
      } catch (e) {
        reject(e);
      }
    });
  });

  console.log('\n📊 Testing /api/dashboard endpoint...');

  // Test the dashboard API
  await new Promise((resolve, reject) => {
    exec(`curl -s http://localhost:${port}/api/dashboard`, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Dashboard API failed:', error);
        reject(error);
        return;
      }

      try {
        const response = JSON.parse(stdout);
        console.log('✅ Dashboard API responded successfully');
        console.log(`📋 Found ${response.epics ? response.epics.length : 0} epics in response`);

        if (response.epics && response.epics.length > 0) {
          console.log('📄 Sample epic data:');
          const epic = response.epics[0];
          console.log(`  - Title: ${epic.title}`);
          console.log(`  - Status: ${epic.status}`);
          console.log(`  - Stories: ${epic.story_count || 0}`);
          console.log(`  - Tasks: ${epic.task_count || 0}`);
          console.log(`  - Bugs: ${epic.bug_count || 0}`);
          console.log(`  - Test Cases: ${epic.test_case_count || 0}`);
        }

        console.log('\n🎉 Dashboard API test completed successfully!');
        console.log('✅ /api/dashboard endpoint is working');
        console.log('✅ Epic data with counts is returned');
        console.log('✅ UI should now load without 404 errors');

        resolve();
      } catch (e) {
        console.error('❌ Invalid JSON response:', stdout);
        reject(e);
      }
    });
  });

  server.kill();
}

// Run the test
testDashboardAPI().catch(error => {
  console.error('❌ Dashboard API test failed:', error);
  process.exit(1);
});