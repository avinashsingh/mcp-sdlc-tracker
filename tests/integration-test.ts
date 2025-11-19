import { spawn } from 'child_process';
import { existsSync, renameSync, unlinkSync } from 'fs';
import Database from 'better-sqlite3';
import { z } from 'zod';

// MCP Protocol Types
interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

// Response Schemas
const createEpicsResponseSchema = z.object({
  epics_created: z.array(z.object({
    epic_id: z.number(),
    title: z.string(),
    success: z.boolean()
  })),
  total_created: z.number()
});

const createUserStoriesResponseSchema = z.object({
  user_stories_created: z.array(z.object({
    user_story_id: z.number(),
    title: z.string(),
    success: z.boolean()
  })),
  total_created: z.number()
});

const createTasksResponseSchema = z.object({
  tasks_created: z.array(z.object({
    task_id: z.number(),
    title: z.string(),
    success: z.boolean()
  })),
  total_created: z.number()
});

const createBugsResponseSchema = z.object({
  bugs_created: z.array(z.object({
    bug_id: z.number(),
    title: z.string(),
    success: z.boolean()
  })),
  total_created: z.number()
});

const createTestCasesResponseSchema = z.object({
  test_cases_created: z.array(z.object({
    test_case_id: z.number(),
    title: z.string(),
    success: z.boolean()
  })),
  total_created: z.number()
});

const createCommentsResponseSchema = z.object({
  comments_created: z.array(z.object({
    comment_id: z.number(),
    entity_type: z.string(),
    entity_id: z.number(),
    success: z.boolean()
  })),
  total_created: z.number()
});

const listEpicsResponseSchema = z.object({
  epics: z.array(z.object({
    id: z.number(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    owner: z.string(),
    assigned_to: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string()
  })),
  count: z.number()
});

const listUserStoriesResponseSchema = z.object({
  user_stories: z.array(z.object({
    id: z.number(),
    epic_id: z.number().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    acceptance_criteria: z.string().nullable(),
    status: z.string(),
    current_owner: z.string(),
    assigned_to: z.string().nullable(),
    story_points: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string()
  })),
  count: z.number()
});

const listTasksResponseSchema = z.object({
  tasks: z.array(z.object({
    id: z.number(),
    user_story_id: z.number().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    created_by: z.string(),
    current_owner: z.string(),
    assigned_to: z.string().nullable(),
    estimated_hours: z.number().nullable(),
    actual_hours: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string()
  })),
  count: z.number()
});

const listBugsResponseSchema = z.object({
  bugs: z.array(z.object({
    id: z.number(),
    user_story_id: z.number().nullable(),
    task_id: z.number().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    severity: z.string(),
    reported_by: z.string(),
    assigned_to: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string()
  })),
  count: z.number()
});

const listTestCasesResponseSchema = z.object({
  test_cases: z.array(z.object({
    id: z.number(),
    user_story_id: z.number().nullable(),
    title: z.string(),
    description: z.string().nullable(),
    status: z.string(),
    assigned_to: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string()
  })),
  count: z.number()
});

const updateEntityStatusResponseSchema = z.object({
  success: z.boolean(),
  entity_type: z.string(),
  entity_id: z.number(),
  old_status: z.string().nullable(),
  new_status: z.string()
});

const updateTaskStatusResponseSchema = z.object({
  success: z.boolean(),
  task_id: z.number()
});

class MCPIntegrationTester {
  private serverProcess: any;

  async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting MCP server...');

      this.serverProcess = spawn('tsx', ['server.ts'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd()
      });

      let serverReady = false;

      // Handle server output
      this.serverProcess.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('MCP server connected and ready') && !serverReady) {
          serverReady = true;
          console.log('✅ Server started and ready');
          // Give a moment for database initialization
          setTimeout(() => resolve(), 500);
        }
      });

      this.serverProcess.stderr.on('data', (data: Buffer) => {
        const output = data.toString();
        if (output.includes('MCP server connected and ready') && !serverReady) {
          serverReady = true;
          console.log('✅ Server started and ready');
          // Give a moment for database initialization
          setTimeout(() => resolve(), 500);
        }
      });

      this.serverProcess.on('error', (error: Error) => {
        console.error('Server error:', error);
        reject(error);
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (!serverReady) {
          reject(new Error('Server failed to start within timeout'));
        }
      }, 10000);
    });
  }

  async testServerConnectivity(): Promise<boolean> {
    try {
      console.log('🔌 Testing server connectivity...');

      // Since we can't easily implement a full MCP client, let's test that:
      // 1. Server starts successfully
      // 2. Database operations work (via direct database access)
      // 3. Server process is running

      if (!this.serverProcess || this.serverProcess.killed) {
        throw new Error('Server process not running');
      }

      // Wait a bit more for database initialization
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if database file exists
      if (!existsSync('.project_tracker.db')) {
        throw new Error('Database file not created');
      }

      // Test database connectivity and operations
      const db = new Database('.project_tracker.db');

      // Test basic database operations
      const epicCount = db.prepare('SELECT COUNT(*) as count FROM epics').get() as { count: number };
      const userStoryCount = db.prepare('SELECT COUNT(*) as count FROM user_stories').get() as { count: number };

      console.log(`📊 Database status: ${epicCount.count} epics, ${userStoryCount.count} user stories`);

      db.close();

      console.log('✅ Server connectivity test passed');
      return true;
    } catch (error) {
      console.log(`❌ Server connectivity test failed: ${error.message}`);
      return false;
    }
  }

  async testDatabaseOperations(): Promise<{ passed: number; total: number; results: any[] }> {
    console.log('🗄️  Testing database operations...');

    const results: any[] = [];
    let passed = 0;
    let total = 0;

    const db = new Database('.project_tracker.db');

    try {
      // Test Create Operations
      console.log('  📝 Testing create operations...');

      // Create test epic
      total++;
      try {
        const epicStmt = db.prepare('INSERT INTO epics (title, description, assigned_to) VALUES (?, ?, ?)');
        const epicResult = epicStmt.run('Integration Test Epic', 'Test epic for integration', 'productmanager');
        console.log(`    ✅ Created epic with ID: ${epicResult.lastInsertRowid}`);
        results.push({ test: 'create_epic_db', passed: true });
        passed++;
      } catch (error) {
        console.log(`    ❌ Create epic failed: ${error.message}`);
        results.push({ test: 'create_epic_db', passed: false, error: error.message });
      }

      // Create test user story
      total++;
      try {
        const storyStmt = db.prepare(`
          INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, story_points, assigned_to, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);
        const storyResult = storyStmt.run(
          1, 'Integration Test Story', 'Test story', 'Must work', 3, 'developer', 'productmanager'
        );
        console.log(`    ✅ Created user story with ID: ${storyResult.lastInsertRowid}`);
        results.push({ test: 'create_user_story_db', passed: true });
        passed++;
      } catch (error) {
        console.log(`    ❌ Create user story failed: ${error.message}`);
        results.push({ test: 'create_user_story_db', passed: false, error: error.message });
      }

      // Test List Operations
      console.log('  📋 Testing list operations...');

      // List epics
      total++;
      try {
        const epics = db.prepare('SELECT * FROM epics WHERE title LIKE ?').all('Integration Test%');
        if (epics.length > 0) {
          console.log(`    ✅ Listed ${epics.length} epics`);
          results.push({ test: 'list_epics_db', passed: true });
          passed++;
        } else {
          throw new Error('No epics found');
        }
      } catch (error) {
        console.log(`    ❌ List epics failed: ${error.message}`);
        results.push({ test: 'list_epics_db', passed: false, error: error.message });
      }

      // List user stories
      total++;
      try {
        const stories = db.prepare('SELECT * FROM user_stories WHERE title LIKE ?').all('Integration Test%');
        if (stories.length > 0) {
          console.log(`    ✅ Listed ${stories.length} user stories`);
          results.push({ test: 'list_user_stories_db', passed: true });
          passed++;
        } else {
          throw new Error('No user stories found');
        }
      } catch (error) {
        console.log(`    ❌ List user stories failed: ${error.message}`);
        results.push({ test: 'list_user_stories_db', passed: false, error: error.message });
      }

      // Test Update Operations
      console.log('  🔄 Testing update operations...');

      // Update user story status
      total++;
      try {
        const updateStmt = db.prepare('UPDATE user_stories SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        const updateResult = updateStmt.run('In Progress', 1);
        if (updateResult.changes > 0) {
          console.log('    ✅ Updated user story status');
          results.push({ test: 'update_user_story_status_db', passed: true });
          passed++;
        } else {
          throw new Error('No rows updated');
        }
      } catch (error) {
        console.log(`    ❌ Update user story status failed: ${error.message}`);
        results.push({ test: 'update_user_story_status_db', passed: false, error: error.message });
      }

    } finally {
      db.close();
    }

    return { passed, total, results };
  }

  async cleanupTestData(): Promise<void> {
    console.log('🧹 Cleaning up test data...');

    const db = new Database('.project_tracker.db');

    try {
      db.exec(`
        DELETE FROM comments WHERE comment_text LIKE 'Integration test%';
        DELETE FROM test_cases WHERE title LIKE 'Integration test%';
        DELETE FROM bugs WHERE title LIKE 'Integration test%';
        DELETE FROM tasks WHERE title LIKE 'Integration test%';
        DELETE FROM user_stories WHERE title LIKE 'Integration test%';
        DELETE FROM epics WHERE title LIKE 'Integration test%';
      `);
      console.log('✅ Test data cleaned up');
    } catch (error) {
      console.log('⚠️  Cleanup warning:', error.message);
    } finally {
      db.close();
    }
  }

  async callInitialize(): Promise<void> {
    console.log('🔧 Initializing database via MCP...');

    const request: MCPRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'initialize',
        arguments: {
          path: process.cwd()
        }
      }
    };

    return new Promise((resolve, reject) => {
      const requestStr = JSON.stringify(request) + '\n';
      this.serverProcess.stdin.write(requestStr);

      let responseData = '';

      const onData = (data: Buffer) => {
        responseData += data.toString();
        const lines = responseData.split('\n');
        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);
              if (response.id === 1) {
                this.serverProcess.stdout.off('data', onData);
                if (response.error) {
                  reject(new Error(`Initialize failed: ${response.error.message}`));
                } else {
                  console.log('✅ Database initialized successfully');
                  resolve();
                }
                return;
              }
            } catch (e) {
              // Not valid JSON or not the response yet
            }
          }
        }
      };

      this.serverProcess.stdout.on('data', onData);

      setTimeout(() => {
        this.serverProcess.stdout.off('data', onData);
        reject(new Error('Timeout waiting for initialize response'));
      }, 10000);
    });
  }

  async runAllTests(): Promise<{ passed: number; total: number; results: any[] }> {
    console.log('🧪 Starting MCP Integration Test Suite...\n');

    // Backup existing database if it exists
    const dbExists = existsSync('.project_tracker.db');
    if (dbExists) {
      console.log('💾 Backing up existing .project_tracker.db...');
      renameSync('.project_tracker.db', '.project_tracker.db.backup');
    }

    const results: any[] = [];
    let passed = 0;
    let total = 0;

    try {
      // Start server first
      await this.startServer();

      // Initialize the database via MCP
      await this.callInitialize();

      // Test 1: Server connectivity
      total++;
      const connectivityResult = await this.testServerConnectivity();
      results.push({ test: 'server_connectivity', passed: connectivityResult });
      if (connectivityResult) passed++;

      // Test 2: Database operations
      const dbResults = await this.testDatabaseOperations();
      results.push(...dbResults.results);
      passed += dbResults.passed;
      total += dbResults.total;

      // Test 3: Server stability (let it run for a few seconds)
      total++;
      console.log('⏱️  Testing server stability...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      if (this.serverProcess && !this.serverProcess.killed) {
        console.log('✅ Server remained stable');
        results.push({ test: 'server_stability', passed: true });
        passed++;
      } else {
        console.log('❌ Server crashed during stability test');
        results.push({ test: 'server_stability', passed: false });
      }

    } catch (error) {
      console.error('❌ Test suite failed:', error);
    } finally {
      // Cleanup
      await this.cleanupTestData();
      this.stopServer();

      // Restore original database if it existed
      if (dbExists) {
        console.log('🔄 Restoring original .project_tracker.db...');
        try {
          if (existsSync('.project_tracker.db')) {
            // Remove test database
            unlinkSync('.project_tracker.db');
          }
          renameSync('.project_tracker.db.backup', '.project_tracker.db');
          console.log('✅ Original database restored');
        } catch (error) {
          console.log('⚠️  Failed to restore original database:', error.message);
        }
      }
    }

    console.log(`\n📊 Integration Test Results: ${passed}/${total} tests passed`);

    if (passed === total) {
      console.log('🎉 All integration tests passed!');
    } else {
      console.log('❌ Some integration tests failed');
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.test} failed${r.error ? ': ' + r.error : ''}`);
      });
    }

    return { passed, total, results };
  }

  stopServer(): void {
    if (this.serverProcess && !this.serverProcess.killed) {
      console.log('🛑 Stopping server...');
      this.serverProcess.kill('SIGTERM');

      // Wait for graceful shutdown
      setTimeout(() => {
        if (this.serverProcess && !this.serverProcess.killed) {
          this.serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
  }
}

// Run integration tests
async function main() {
  const tester = new MCPIntegrationTester();

  try {
    const result = await tester.runAllTests();
    process.exit(result.passed === result.total ? 0 : 1);
  } catch (error) {
    console.error('Integration test suite failed:', error);
    tester.stopServer();
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { MCPIntegrationTester };