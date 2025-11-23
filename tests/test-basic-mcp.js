import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

console.log('🔍 Testing Basic MCP Communication');
console.log('==================================');

async function testBasicMcp() {
  console.log('🚀 Starting MCP server...');

  const server = spawn('tsx', [serverPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NODE_ENV: 'test' }
  });

  let serverReady = false;

  // Monitor server output
  server.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('MCP server connected and ready') && !serverReady) {
      serverReady = true;
      console.log('✅ MCP server ready');
    }
  });

  server.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Wiki tools registered')) {
      console.log('✅ Wiki tools registered');
    }
  });

  // Wait for server to be ready
  await new Promise((resolve) => {
    const checkReady = () => {
      if (serverReady) {
        resolve();
      } else {
        setTimeout(checkReady, 500);
      }
    };
    checkReady();
  });

  console.log('\n📋 Testing tools/list...');

  // Test tools/list
  const toolsListRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/list',
    params: {}
  };

  server.stdin.write(JSON.stringify(toolsListRequest) + '\n');

  // Wait for response
  let responseReceived = false;
  server.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('"id":1') && !responseReceived) {
      responseReceived = true;
      console.log('✅ tools/list response received');
      console.log('Response preview:', output.substring(0, 200) + '...');

      // Try a simple tool call
      console.log('\n🔧 Testing create_wiki_page tool...');

      const createWikiRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'create_wiki_page',
          arguments: {
            title: 'Test Wiki Page',
            content: '# Test Content\n\nThis is a test.',
            category: 'technical'
          }
        }
      };

      server.stdin.write(JSON.stringify(createWikiRequest) + '\n');
    }

    if (output.includes('"id":2') && responseReceived) {
      console.log('✅ create_wiki_page response received');
      console.log('Response preview:', output.substring(0, 300) + '...');

      console.log('\n🎉 Basic MCP communication test completed!');
      server.kill();
    }
  });

  // Timeout after 10 seconds
  setTimeout(() => {
    console.log('⏰ Test timeout - killing server');
    server.kill();
  }, 10000);
}

// Run the basic test
testBasicMcp().catch(error => {
  console.error('❌ Basic MCP test failed:', error);
});