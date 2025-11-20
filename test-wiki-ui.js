import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

console.log('🧪 Testing Wiki UI Integration');
console.log('==============================');

async function testWikiUI() {
  console.log('🚀 Starting MCP server for UI testing...');

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
    exec(`curl -s -X POST http://localhost:${port}/api/initialize -H "Content-Type: application/json" -d '{"currentProjectLocation": "/tmp/wiki-ui-test"}'`, (error, stdout, stderr) => {
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

  console.log('\n📚 Creating test wiki page...');

  // Create a wiki page via API
  await new Promise((resolve, reject) => {
    const wikiData = {
      title: 'UI Testing Guide',
      content: '# UI Testing Guide\n\nThis guide covers comprehensive UI testing strategies for web applications.\n\n## Key Testing Areas\n\n- **Visual Testing**: Ensure UI elements render correctly\n- **Interaction Testing**: Test user interactions and workflows\n- **Responsive Testing**: Verify mobile and desktop layouts\n- **Accessibility Testing**: Check WCAG compliance\n\n## Best Practices\n\n1. Test on multiple browsers\n2. Use automated testing tools\n3. Include visual regression testing\n4. Test with real user scenarios',
      summary: 'Comprehensive guide for UI testing methodologies and best practices',
      category: 'technical',
      tags: 'testing, ui, quality assurance'
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

  console.log('\n🌐 Testing wiki UI access...');

  // Test wiki API endpoints
  await new Promise((resolve, reject) => {
    exec(`curl -s http://localhost:${port}/api/wiki`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      try {
        const wikiPages = JSON.parse(stdout);
        console.log(`✅ Wiki API returned ${wikiPages.length} pages`);

        if (wikiPages.length > 0) {
          const page = wikiPages[0];
          console.log(`📄 Found wiki page: "${page.title}" (${page.status})`);
          console.log(`🏷️  Category: ${page.category}, Comments: ${page.comment_count}`);

          // Test individual wiki page
          exec(`curl -s http://localhost:${port}/api/wiki/${page.id}`, (error, stdout, stderr) => {
            if (error) {
              reject(error);
              return;
            }

            try {
              const pageDetail = JSON.parse(stdout);
              console.log(`✅ Wiki page detail loaded: ${pageDetail.content.substring(0, 50)}...`);
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        } else {
          reject(new Error('No wiki pages found'));
        }
      } catch (e) {
        reject(e);
      }
    });
  });

  console.log('\n🎉 Wiki UI integration test completed successfully!');
  console.log('===============================================');
  console.log('✅ Wiki pages can be created via API');
  console.log('✅ Wiki pages are accessible via API');
  console.log('✅ Wiki UI should now display wiki pages in the Wiki tab');
  console.log('');
  console.log('🌐 Access the wiki at:');
  console.log(`   http://localhost:${port}`);
  console.log('   Click on the "Wiki" tab to see wiki pages!');

  // Keep server running for manual testing
  console.log('\n🖥️  Server is still running for manual UI testing...');
  console.log('   Press Ctrl+C to stop the server');

  // Don't kill the server - let user test manually
  // server.kill();
}

// Run the test
testWikiUI().catch(error => {
  console.error('❌ Wiki UI test failed:', error);
  process.exit(1);
});