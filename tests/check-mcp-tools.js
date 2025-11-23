import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

console.log('🔍 Checking MCP Tool Registration');
console.log('==================================');

async function checkMcpTools() {
  console.log('🚀 Starting MCP server...');

  const server = spawn('tsx', [serverPath], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'inherit'],
    env: { ...process.env, NODE_ENV: 'test' }
  });

  let serverReady = false;
  let toolsListed = false;

  // Monitor server output
  server.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('Server:', output.trim());

    if (output.includes('MCP server connected and ready') && !serverReady) {
      serverReady = true;
      console.log('✅ MCP server ready');

      // Try to list available tools by sending a tools/list request
      setTimeout(() => {
        console.log('\n📋 Requesting tool list...');
        // Send a tools/list request via stdin
        const toolsListRequest = {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/list',
          params: {}
        };
        server.stdin.write(JSON.stringify(toolsListRequest) + '\n');
      }, 1000);
    }

    if (output.includes('tools/list') || output.includes('tools')) {
      console.log('📋 Tools response detected');
      toolsListed = true;
    }
  });

  // Wait for tools to be listed or timeout
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log('⏰ Timeout waiting for tools list');
      resolve();
    }, 5000);

    const checkComplete = () => {
      if (toolsListed) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(checkComplete, 500);
      }
    };
    checkComplete();
  });

  console.log('\n🔧 Checking if wiki tools are registered...');

  // Try to call a wiki tool to see if it works
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

  console.log('📝 Attempting to call create_wiki_page tool...');
  server.stdin.write(JSON.stringify(createWikiRequest) + '\n');

  // Wait a bit for response
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('\n✅ MCP tools check completed');
  server.kill();
}

// Run the check
checkMcpTools().catch(error => {
  console.error('❌ MCP tools check failed:', error);
  process.exit(1);
});