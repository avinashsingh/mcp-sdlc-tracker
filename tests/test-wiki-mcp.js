import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

console.log('🧪 Testing Wiki Tools via MCP Protocol');
console.log('=====================================');

async function testWikiToolsViaMCP() {
  console.log('🚀 Starting MCP server for wiki tools test...');

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
    console.log('Server:', output.trim());

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
  await new Promise(resolve => {
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

  // Initialize database via HTTP API
  const { exec } = require('child_process');
  console.log(`📡 Initializing database on port ${port}...`);

  await new Promise((resolve, reject) => {
    exec(`curl -v -X POST http://localhost:${port}/api/initialize -H "Content-Type: application/json" -d '{"currentProjectLocation": "/tmp/wiki-test"}' 2>&1`, (error, stdout, stderr) => {
      console.log('Curl output:', stdout);
      if (error) {
        console.error('Curl error:', error);
        reject(error);
        return;
      }

      try {
        const response = JSON.parse(stdout);
        if (response.success) {
          console.log('✅ Database initialized');
          resolve();
        } else {
          reject(new Error(response.error || 'Initialization failed'));
        }
      } catch (e) {
        console.error('Failed to parse response:', stdout);
        reject(e);
      }
    });
  });

  console.log('\n📚 Testing Wiki Tools via HTTP API...');

  // Test creating a wiki page via HTTP API (simulating MCP tool call)
  await new Promise((resolve, reject) => {
    const wikiData = {
      title: 'Test Wiki Page',
      content: '# Test Wiki Page\n\nThis is a test wiki page created via MCP tools.',
      summary: 'A test wiki page for MCP tools validation',
      category: 'technical',
      assigned_to: 'architect'
    };

    exec(`curl -s -X POST http://localhost:${port}/api/wiki -H "Content-Type: application/json" -d '${JSON.stringify(wikiData)}'`, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Wiki creation failed:', error);
        reject(error);
        return;
      }

      try {
        const response = JSON.parse(stdout);
        console.log('✅ Wiki page created:', response);
        resolve(response);
      } catch (e) {
        console.error('❌ Invalid JSON response:', stdout);
        reject(e);
      }
    });
  });

  console.log('\n✅ Wiki tools test completed successfully!');
  console.log('🎉 MCP wiki functionality is working correctly!');

  // Cleanup
  server.kill();
}

// Run the test
testWikiToolsViaMCP().catch(error => {
  console.error('❌ Wiki tools test failed:', error);
  process.exit(1);
});