#!/usr/bin/env tsx

/**
 * Comprehensive SQL Query Tests
 * Tests for ambiguous column name issues and other SQL problems
 * by calling actual MCP tool functions from server.ts
 */

import { initializeDatabase } from '../database-schema';
import { tracker_create_epics, tracker_create_user_stories, tracker_list_epics, tracker_list_user_stories, tracker_list_tasks } from '../server';

// Test database setup
const TEST_DB_PATH = './test-sql-queries.db';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

class SQLQueryTests {
  private db: any;
  private results: TestResult[] = [];

  async setup() {
    console.log('🔧 Setting up test database...');
    this.db = initializeDatabase(TEST_DB_PATH);
    
    // Create test data
    await this.createTestData();
  }

  async teardown() {
    console.log('🧹 Cleaning up...');
    if (this.db) {
      this.db.close();
    }
    // Remove test database file
    try {
      const fs = await import('fs/promises');
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // File might not exist, ignore
    }
  }

  async createTestData() {
    console.log('📝 Creating test data...');
    
    // Create epics with different statuses
    await tracker_create_epics({
      epics: [
        { title: 'Epic 1 - Open', description: 'Test epic 1', assigned_to: 'productmanager' },
        { title: 'Epic 2 - New', description: 'Test epic 2', assigned_to: 'productmanager' },
        { title: 'Epic 3 - Closed', description: 'Test epic 3', assigned_to: 'productmanager' }
      ]
    });

    // Create user stories with different statuses
    await tracker_create_user_stories({
      user_stories: [
        { epic_id: 1, title: 'Story 1 - In Progress', description: 'Test story 1', assigned_to: 'developer', story_points: 5 },
        { epic_id: 1, title: 'Story 2 - New', description: 'Test story 2', assigned_to: 'developer', story_points: 3 },
        { epic_id: 2, title: 'Story 3 - QA', description: 'Test story 3', assigned_to: 'tester', story_points: 8 }
      ]
    });
  }

  async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    try {
      await testFn();
      const duration = Date.now() - startTime;
      this.results.push({ name: testName, passed: true, duration });
      console.log(`✅ ${testName}: PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.results.push({ 
        name: testName, 
        passed: false, 
        error: error instanceof Error ? error.message : String(error),
        duration 
      });
      console.log(`❌ ${testName}: FAILED - ${error instanceof Error ? error.message : String(error)} (${duration}ms)`);
    }
  }

  // Test: list_epics with status filter should not have ambiguous column error
  async test_list_epics_status_filter() {
    console.log('Testing list_epics with status filter...');
    
    // This should work without "ambiguous column name" error
    const result = await tracker_list_epics({ status: 'Open' });
    
    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error('Expected valid result with data array');
    }
    
    // Should find at least one open epic
    const openEpics = result.data.filter((epic: any) => epic.status === 'Open');
    if (openEpics.length === 0) {
      throw new Error('Expected to find at least one open epic');
    }
    
    console.log(`Found ${openEpics.length} open epics`);
  }

  // Test: list_epics with all filters combined
  async test_list_epics_combined_filters() {
    console.log('Testing list_epics with combined filters...');
    
    const result = await tracker_list_epics({ 
      status: 'New', 
      dependencies_resolved: true,
      limit: 10 
    });
    
    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error('Expected valid result with data array');
    }
    
    // All returned epics should have status 'New'
    const allNew = result.data.every((epic: any) => epic.status === 'New');
    if (!allNew) {
      throw new Error('Expected all epics to have status "New"');
    }
    
    console.log(`Found ${result.data.length} new epics with resolved dependencies`);
  }

  // Test: list_user_stories with status filter should not have wrong table alias
  async test_list_user_stories_status_filter() {
    console.log('Testing list_user_stories with status filter...');

    const result = await tracker_list_user_stories({ status: 'In Progress' });

    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error('Expected valid result with data array');
    }

    // Should find at least one in-progress story
    const inProgressStories = result.data.filter((story: any) => story.status === 'In Progress');
    if (inProgressStories.length === 0) {
      throw new Error('Expected to find at least one in-progress story');
    }

    console.log(`Found ${inProgressStories.length} in-progress stories`);

    // Check if wiki_links is present
    if (result.data.length > 0) {
      const story = result.data[0];
      if (!('wiki_links' in story)) {
        throw new Error('wiki_links field is missing from user story');
      }
      console.log(`wiki_links present: ${JSON.stringify(story.wiki_links)}`);
    }
  }

  // Test: list_user_stories with epic filter
  async test_list_user_stories_epic_filter() {
    console.log('Testing list_user_stories with epic filter...');
    
    const result = await tracker_list_user_stories({ epic_id: 1 });
    
    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error('Expected valid result with data array');
    }
    
    // All returned stories should belong to epic 1
    const allFromEpic1 = result.data.every((story: any) => story.epic_id === 1);
    if (!allFromEpic1) {
      throw new Error('Expected all stories to belong to epic 1');
    }
    
    console.log(`Found ${result.data.length} stories for epic 1`);
  }

  // Test: list_tasks with status filter (single table, should work fine)
  async test_list_tasks_status_filter() {
    console.log('Testing list_tasks with status filter...');
    
    // First create some tasks
    await this.createTestTasks();
    
    const result = await tracker_list_tasks({ status: 'New' });
    
    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error('Expected valid result with data array');
    }
    
    // Should find tasks (though we might not have any with the test data)
    console.log(`Found ${result.data.length} new tasks`);
  }

  async createTestTasks() {
    // Import the function dynamically to avoid circular dependencies
    const { tracker_create_tasks } = await import('../server');
    
    await tracker_create_tasks({
      tasks: [
        { user_story_id: 1, title: 'Task 1 - New', description: 'Test task 1', assigned_to: 'developer', estimated_hours: 4 },
        { user_story_id: 1, title: 'Task 2 - In Progress', description: 'Test task 2', assigned_to: 'developer', estimated_hours: 6 }
      ]
    });
  }

  // Test: Verify no SQL injection vulnerabilities
  async test_sql_injection_safety() {
    console.log('Testing SQL injection safety...');
    
    // Try to inject SQL through status parameter
    const maliciousInput = "'; DROP TABLE epics; --";
    
    try {
      const result = await tracker_list_epics({ status: maliciousInput as any });
      // If we get here, the input was properly escaped/parameterized
      console.log('SQL injection attempt was properly handled');
    } catch (error) {
      // Should get a validation error, not a SQL error
      if (error instanceof Error && error.message.includes('SQL')) {
        throw new Error('SQL injection vulnerability detected');
      }
      console.log('SQL injection attempt was blocked by validation');
    }
  }

  // Test: Large result sets with limits
  async test_large_result_sets() {
    console.log('Testing large result sets with limits...');
    
    const result = await tracker_list_epics({ limit: 1 });
    
    if (!result || !result.data || !Array.isArray(result.data)) {
      throw new Error('Expected valid result with data array');
    }
    
    if (result.data.length > 1) {
      throw new Error('Expected at most 1 epic due to limit');
    }
    
    console.log(`Limit test passed: got ${result.data.length} epics with limit=1`);
  }

  // Test: Invalid parameters should be handled gracefully
  async test_invalid_parameter_handling() {
    console.log('Testing invalid parameter handling...');
    
    try {
      // Test with invalid status
      await tracker_list_epics({ status: 'InvalidStatus' as any });
      throw new Error('Should have failed with invalid status');
    } catch (error) {
      if (error instanceof Error && error.message.includes('SQL')) {
        throw new Error('Got SQL error instead of validation error');
      }
      console.log('Invalid status was properly handled');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting SQL Query Tests...\n');
    
    await this.setup();
    
    // Run all tests
    await this.runTest('list_epics status filter', () => this.test_list_epics_status_filter());
    await this.runTest('list_epics combined filters', () => this.test_list_epics_combined_filters());
    await this.runTest('list_user_stories status filter', () => this.test_list_user_stories_status_filter());
    await this.runTest('list_user_stories epic filter', () => this.test_list_user_stories_epic_filter());
    await this.runTest('list_tasks status filter', () => this.test_list_tasks_status_filter());
    await this.runTest('SQL injection safety', () => this.test_sql_injection_safety());
    await this.runTest('Large result sets', () => this.test_large_result_sets());
    await this.runTest('Invalid parameter handling', () => this.test_invalid_parameter_handling());
    
    await this.teardown();
    
    // Print summary
    this.printSummary();
  }

  printSummary() {
    console.log('\n📊 Test Summary:');
    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const failed = total - passed;
    
    console.log(`Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => !r.passed)
        .forEach(r => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
    }
    
    const totalDuration = this.results.reduce((sum, r) => sum + (r.duration || 0), 0);
    console.log(`\n⏱️ Total Duration: ${totalDuration}ms`);
    
    if (failed === 0) {
      console.log('\n🎉 All SQL Query Tests Passed!');
    } else {
      console.log(`\n💥 ${failed} SQL Query Test(s) Failed!`);
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tests = new SQLQueryTests();
  tests.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { SQLQueryTests };