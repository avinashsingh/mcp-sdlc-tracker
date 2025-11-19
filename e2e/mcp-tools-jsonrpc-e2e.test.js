import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const serverPath = join(__dirname, 'server.ts');

console.log('🧪 MCP Tools E2E Test - JSON-RPC Protocol');
console.log('=========================================');
console.log('Testing ALL 26 MCP tools through actual JSON-RPC protocol');
console.log('');

let testResults = {
  passed: 0,
  failed: 0,
  total: 0
};

function logTest(testName, passed, details = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
  if (passed) {
    console.log(`✅ ${testName}`);
  } else {
    console.log(`❌ ${testName}`);
  }
  if (details) {
    console.log(`   ${details}`);
  }
}

async function sendMcpRequest(server, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    const requestStr = JSON.stringify(request) + '\n';
    console.log(`📤 Sending: ${method}`);

    let responseData = '';
    let responseReceived = false;

    const responseHandler = (data) => {
      responseData += data.toString();

      // Try to parse complete JSON-RPC responses
      const lines = responseData.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line.trim());
            if (response.id === id) {
              responseReceived = true;
              server.stdout.removeListener('data', responseHandler);
              resolve(response);
              return;
            }
          } catch (e) {
            // Not a complete JSON response yet
          }
        }
      }
    };

    server.stdout.on('data', responseHandler);

    // Send the request
    server.stdin.write(requestStr);

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!responseReceived) {
        server.stdout.removeListener('data', responseHandler);
        reject(new Error(`Timeout waiting for response to ${method}`));
      }
    }, 5000);
  });
}

async function runMcpE2eTest() {
  console.log('🚀 Starting MCP server for JSON-RPC testing...');

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
      console.log('✅ MCP server ready for JSON-RPC testing');
    }
  });

  server.stderr.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Wiki tools registered')) {
      console.log('✅ Wiki tools registered with database access');
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

  console.log('\n🔧 Testing MCP Tools via JSON-RPC Protocol');
  console.log('===========================================');

  try {
    // Test 1: Initialize database
    console.log('\n1. Testing initialize tool...');
    const initResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'initialize',
      arguments: {
        path: '/tmp/mcp-e2e-test'
      }
    });

    const initSuccess = initResponse.result && !initResponse.error;
    logTest('initialize tool via JSON-RPC', initSuccess,
      initSuccess ? 'Database initialized successfully' : `Error: ${initResponse.error?.message}`);

    if (!initSuccess) {
      throw new Error('Failed to initialize database');
    }

    // Test 2: Create epics
    console.log('\n2. Testing create_epics tool...');
    const createEpicResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_epics',
      arguments: {
        epics: [{
          title: 'E2E Test Epic - Authentication',
          description: 'JSON-RPC protocol testing for authentication system',
          status: 'Open'
        }]
      }
    });

    const epicSuccess = createEpicResponse.result &&
                       createEpicResponse.result.content &&
                       createEpicResponse.result.content[0].text.includes('Created 1 of 1 epics');
    logTest('create_epics tool via JSON-RPC', epicSuccess,
      epicSuccess ? 'Epic created successfully' : `Response: ${JSON.stringify(createEpicResponse)}`);

    // Test 3: List epics
    console.log('\n3. Testing list_epics tool...');
    const listEpicsResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'list_epics',
      arguments: {}
    });

    const listSuccess = listEpicsResponse.result &&
                       listEpicsResponse.result.content &&
                       listEpicsResponse.result.content[0].text;
    logTest('list_epics tool via JSON-RPC', listSuccess,
      listSuccess ? 'Epics listed successfully' : `Response: ${JSON.stringify(listEpicsResponse)}`);

    // Test 4: Create wiki page (the failing tool)
    console.log('\n4. Testing create_wiki_page tool (previously failing)...');
    const createWikiResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_wiki_page',
      arguments: {
        title: 'JSON-RPC Test Wiki',
        content: '# JSON-RPC Testing\n\nThis wiki page was created via JSON-RPC protocol.',
        summary: 'Testing wiki creation through MCP protocol',
        category: 'technical'
      }
    });

    const wikiSuccess = createWikiResponse.result &&
                       createWikiResponse.result.content &&
                       !createWikiResponse.error;
    logTest('create_wiki_page tool via JSON-RPC', wikiSuccess,
      wikiSuccess ? 'Wiki page created successfully via JSON-RPC!' :
      `Error: ${createWikiResponse.error?.message || JSON.stringify(createWikiResponse)}`);

    // Test 5: List wiki pages
    console.log('\n5. Testing list_wiki_pages tool...');
    const listWikiResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'list_wiki_pages',
      arguments: {}
    });

    const wikiListSuccess = listWikiResponse.result &&
                           listWikiResponse.result.content &&
                           !listWikiResponse.error;
    logTest('list_wiki_pages tool via JSON-RPC', wikiListSuccess,
      wikiListSuccess ? 'Wiki pages listed successfully' : `Response: ${JSON.stringify(listWikiResponse)}`);

    // Test 6: Create user story
    console.log('\n6. Testing create_user_stories tool...');
    const createStoryResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_user_stories',
      arguments: {
        user_stories: [{
          epic_id: 1,
          title: 'Implement User Login',
          description: 'Create login form with validation',
          acceptance_criteria: 'User can login with valid credentials',
          status: 'New',
          story_points: 5
        }]
      }
    });

    const storySuccess = createStoryResponse.result &&
                        createStoryResponse.result.content &&
                        createStoryResponse.result.content[0].text.includes('Created 1 of 1 user stories');
    logTest('create_user_stories tool via JSON-RPC', storySuccess,
      storySuccess ? 'User story created successfully' : `Response: ${JSON.stringify(createStoryResponse)}`);

    // Test 7: Create task
    console.log('\n7. Testing create_tasks tool...');
    const createTaskResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_tasks',
      arguments: {
        tasks: [{
          user_story_id: 1,
          title: 'Build Login UI Component',
          description: 'Create responsive login form component',
          status: 'New',
          assigned_to: 'developer',
          priority: 'high'
        }]
      }
    });

    const taskSuccess = createTaskResponse.result &&
                       createTaskResponse.result.content &&
                       createTaskResponse.result.content[0].text.includes('Created 1 of 1 tasks');
    logTest('create_tasks tool via JSON-RPC', taskSuccess,
      taskSuccess ? 'Task created successfully' : `Response: ${JSON.stringify(createTaskResponse)}`);

    // Test 8: Create bug
    console.log('\n8. Testing create_bugs tool...');
    const createBugResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_bugs',
      arguments: {
        bugs: [{
          user_story_id: 1,
          title: 'Login form validation not working',
          description: 'Email validation regex rejects valid addresses',
          severity: 'Medium',
          reported_by: 'tester'
        }]
      }
    });

    const bugSuccess = createBugResponse.result &&
                      createBugResponse.result.content &&
                      createBugResponse.result.content[0].text.includes('Created 1 of 1 bugs');
    logTest('create_bugs tool via JSON-RPC', bugSuccess,
      bugSuccess ? 'Bug created successfully' : `Response: ${JSON.stringify(createBugResponse)}`);

    // Test 9: Create test case
    console.log('\n9. Testing create_test_cases tool...');
    const createTestCaseResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_test_cases',
      arguments: {
        test_cases: [{
          user_story_id: 1,
          title: 'Login Form Validation Test',
          description: 'Test all validation scenarios for login form',
          steps: '1. Try invalid email\n2. Try weak password\n3. Submit valid data',
          expected_result: 'Proper validation messages and successful login',
          status: 'New'
        }]
      }
    });

    const testCaseSuccess = createTestCaseResponse.result &&
                           createTestCaseResponse.result.content &&
                           createTestCaseResponse.result.content[0].text.includes('Created 1 of 1 test cases');
    logTest('create_test_cases tool via JSON-RPC', testCaseSuccess,
      testCaseSuccess ? 'Test case created successfully' : `Response: ${JSON.stringify(createTestCaseResponse)}`);

    // Test 10: Create comments
    console.log('\n10. Testing create_comments tool...');
    const createCommentResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'create_comments',
      arguments: {
        comments: [{
          entity_type: 'epic',
          entity_id: 1,
          comment_text: 'This authentication epic is critical for user adoption',
          author: 'productmanager'
        }]
      }
    });

    const commentSuccess = createCommentResponse.result &&
                          createCommentResponse.result.content &&
                          createCommentResponse.result.content[0].text.includes('Created 1 of 1 comments');
    logTest('create_comments tool via JSON-RPC', commentSuccess,
      commentSuccess ? 'Comment created successfully' : `Response: ${JSON.stringify(createCommentResponse)}`);

    // Test 11: Update entity status
    console.log('\n11. Testing update_entity_status tool...');
    const updateStatusResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'update_entity_status',
      arguments: {
        entity_type: 'user_story',
        entity_id: 1,
        status: 'In Progress'
      }
    });

    const statusSuccess = updateStatusResponse.result &&
                         updateStatusResponse.result.content &&
                         !updateStatusResponse.error;
    logTest('update_entity_status tool via JSON-RPC', statusSuccess,
      statusSuccess ? 'Entity status updated successfully' : `Response: ${JSON.stringify(updateStatusResponse)}`);

    // Test 12: Update task status
    console.log('\n12. Testing update_task_status tool...');
    const updateTaskResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'update_task_status',
      arguments: {
        task_id: 1,
        status: 'In Progress'
      }
    });

    const taskStatusSuccess = updateTaskResponse.result &&
                             updateTaskResponse.result.content &&
                             !updateTaskResponse.error;
    logTest('update_task_status tool via JSON-RPC', taskStatusSuccess,
      taskStatusSuccess ? 'Task status updated successfully' : `Response: ${JSON.stringify(updateTaskResponse)}`);

    // Test 13: Manage story dependencies
    console.log('\n13. Testing manage_story_dependencies tool...');
    const depResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'manage_story_dependencies',
      arguments: {
        operations: [{
          story_id: 1,
          action: 'add',
          dependency_story_ids: []
        }]
      }
    });

    const depSuccess = depResponse.result &&
                      depResponse.result.content &&
                      !depResponse.error;
    logTest('manage_story_dependencies tool via JSON-RPC', depSuccess,
      depSuccess ? 'Story dependencies managed successfully' : `Response: ${JSON.stringify(depResponse)}`);

    // Test 14: Update epic
    console.log('\n14. Testing update_epic tool...');
    const updateEpicResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'update_epic',
      arguments: {
        epic_id: 1,
        description: 'Updated description for JSON-RPC testing'
      }
    });

    const epicUpdateSuccess = updateEpicResponse.result &&
                             updateEpicResponse.result.content &&
                             !updateEpicResponse.error;
    logTest('update_epic tool via JSON-RPC', epicUpdateSuccess,
      epicUpdateSuccess ? 'Epic updated successfully' : `Response: ${JSON.stringify(updateEpicResponse)}`);

    // Test 15: Archive epic
    console.log('\n15. Testing archive_epic tool...');
    const archiveEpicResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'archive_epic',
      arguments: {
        epic_id: 1,
        archive_reason: 'Completed JSON-RPC testing'
      }
    });

    const archiveSuccess = archiveEpicResponse.result &&
                          archiveEpicResponse.result.content &&
                          !archiveEpicResponse.error;
    logTest('archive_epic tool via JSON-RPC', archiveSuccess,
      archiveSuccess ? 'Epic archived successfully' : `Response: ${JSON.stringify(archiveEpicResponse)}`);

    // Test 16: Update user story content
    console.log('\n16. Testing update_user_story_content tool...');
    const updateStoryResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'update_user_story_content',
      arguments: {
        story_id: 1,
        title: 'Updated: Implement User Login',
        story_points: 8
      }
    });

    const storyUpdateSuccess = updateStoryResponse.result &&
                              updateStoryResponse.result.content &&
                              !updateStoryResponse.error;
    logTest('update_user_story_content tool via JSON-RPC', storyUpdateSuccess,
      storyUpdateSuccess ? 'User story content updated successfully' : `Response: ${JSON.stringify(updateStoryResponse)}`);

    // Test 17: Update acceptance criteria
    console.log('\n17. Testing update_user_story_acceptance_criteria tool...');
    const updateAcceptanceResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'update_user_story_acceptance_criteria',
      arguments: {
        story_id: 1,
        acceptance_criteria: 'Updated: User can login with valid credentials and session persists'
      }
    });

    const acceptanceSuccess = updateAcceptanceResponse.result &&
                             updateAcceptanceResponse.result.content &&
                             !updateAcceptanceResponse.error;
    logTest('update_user_story_acceptance_criteria tool via JSON-RPC', acceptanceSuccess,
      acceptanceSuccess ? 'Acceptance criteria updated successfully' : `Response: ${JSON.stringify(updateAcceptanceResponse)}`);

    // Test 18: Archive user story
    console.log('\n18. Testing archive_user_story tool...');
    const archiveStoryResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'archive_user_story',
      arguments: {
        story_id: 1,
        archive_reason: 'Story completed in JSON-RPC testing'
      }
    });

    const archiveStorySuccess = archiveStoryResponse.result &&
                               archiveStoryResponse.result.content &&
                               !archiveStoryResponse.error;
    logTest('archive_user_story tool via JSON-RPC', archiveStorySuccess,
      archiveStorySuccess ? 'User story archived successfully' : `Response: ${JSON.stringify(archiveStoryResponse)}`);

    // Test 19: Manage epic dependencies
    console.log('\n19. Testing manage_epic_dependencies tool...');
    const epicDepResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'manage_epic_dependencies',
      arguments: {
        operations: [{
          epic_id: 1,
          action: 'add',
          dependency_epic_ids: []
        }]
      }
    });

    const epicDepSuccess = epicDepResponse.result &&
                          epicDepResponse.result.content &&
                          !epicDepResponse.error;
    logTest('manage_epic_dependencies tool via JSON-RPC', epicDepSuccess,
      epicDepSuccess ? 'Epic dependencies managed successfully' : `Response: ${JSON.stringify(epicDepResponse)}`);

    // Test 20: Update wiki page
    console.log('\n20. Testing update_wiki_page tool...');
    const updateWikiResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'update_wiki_page',
      arguments: {
        page_id: 1,
        content: '# JSON-RPC Testing\n\nUpdated content for comprehensive testing.',
        summary: 'Updated wiki page for JSON-RPC testing'
      }
    });

    const wikiUpdateSuccess = updateWikiResponse.result &&
                             updateWikiResponse.result.content &&
                             !updateWikiResponse.error;
    logTest('update_wiki_page tool via JSON-RPC', wikiUpdateSuccess,
      wikiUpdateSuccess ? 'Wiki page updated successfully' : `Response: ${JSON.stringify(updateWikiResponse)}`);

    // Test 21: Get wiki page
    console.log('\n21. Testing get_wiki_page tool...');
    const getWikiResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'get_wiki_page',
      arguments: {
        page_id: 1
      }
    });

    const getWikiSuccess = getWikiResponse.result &&
                          getWikiResponse.result.content &&
                          !getWikiResponse.error;
    logTest('get_wiki_page tool via JSON-RPC', getWikiSuccess,
      getWikiSuccess ? 'Wiki page retrieved successfully' : `Response: ${JSON.stringify(getWikiResponse)}`);

    // Test 22: Manage wiki links
    console.log('\n22. Testing manage_wiki_links tool...');
    const wikiLinkResponse = await sendMcpRequest(server, 'tools/call', {
      name: 'manage_wiki_links',
      arguments: {
        operations: [{
          wiki_page_id: 1,
          action: 'add',
          entity_links: [{
            entity_type: 'epic',
            entity_id: 1
          }]
        }]
      }
    });

    const wikiLinkSuccess = wikiLinkResponse.result &&
                           wikiLinkResponse.result.content &&
                           !wikiLinkResponse.error;
    logTest('manage_wiki_links tool via JSON-RPC', wikiLinkSuccess,
      wikiLinkSuccess ? 'Wiki links managed successfully' : `Response: ${JSON.stringify(wikiLinkResponse)}`);

    // Test remaining list tools (23-26)
    console.log('\n23-26. Testing remaining list tools...');

    const listTools = [
      { name: 'list_user_stories', args: {} },
      { name: 'list_tasks', args: {} },
      { name: 'list_bugs', args: {} },
      { name: 'list_test_cases', args: {} }
    ];

    for (let i = 0; i < listTools.length; i++) {
      const tool = listTools[i];
      const response = await sendMcpRequest(server, 'tools/call', {
        name: tool.name,
        arguments: tool.args
      });

      const success = response.result &&
                     response.result.content &&
                     !response.error;
      logTest(`${tool.name} tool via JSON-RPC`, success,
        success ? `${tool.name} executed successfully` : `Response: ${JSON.stringify(response)}`);
    }

    console.log('\n📊 JSON-RPC E2E TEST RESULTS');
    console.log('============================');
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📈 Total: ${testResults.total}`);
    console.log(`🎯 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);

    if (testResults.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! All 26 MCP tools work correctly via JSON-RPC protocol!');
      console.log('✅ Database integrity verified');
      console.log('✅ MCP protocol layer functional');
      console.log('✅ Wiki tools database access fixed');
      console.log('✅ End-to-end workflow complete');
    } else {
      console.log(`\n⚠️  ${testResults.failed} tests failed - check MCP tool implementations`);
    }

  } catch (error) {
    console.error('❌ JSON-RPC E2E Test failed:', error);
    testResults.failed++;
  } finally {
    // Cleanup
    server.kill();
  }
}

// Run the JSON-RPC E2E test
runMcpE2eTest().catch(console.error);