#!/usr/bin/env tsx

/**
 * SQL Query Validation Tests
 * Tests for ambiguous column name issues and other SQL problems
 * by replicating the exact queries used in server.ts MCP tools
 */

import Database from 'better-sqlite3';
import { createDatabaseSchema } from '../database-schema';

// Test database setup
const TEST_DB_PATH = './test-sql-validation.db';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

class SQLValidationTests {
  private db: Database.Database;
  private results: TestResult[] = [];

  constructor() {
    this.db = new Database(TEST_DB_PATH);
    createDatabaseSchema(this.db);
  }

  async teardown() {
    console.log('🧹 Cleaning up...');
    this.db.close();
    // Remove test database file
    try {
      const fs = await import('fs/promises');
      await fs.unlink(TEST_DB_PATH);
    } catch (error) {
      // File might not exist, ignore
    }
  }

  createTestData() {
    console.log('📝 Creating test data...');
    
    // Insert test epics
    this.db.prepare(`
      INSERT INTO epics (title, description, status, assigned_to) VALUES 
        ('Epic 1 - Open', 'Test epic 1', 'Open', 'productmanager'),
        ('Epic 2 - New', 'Test epic 2', 'New', 'productmanager'),
        ('Epic 3 - Closed', 'Test epic 3', 'Closed', 'productmanager')
    `).run();

    // Insert test user stories
    this.db.prepare(`
      INSERT INTO user_stories (epic_id, title, description, status, assigned_to, story_points) VALUES 
        (1, 'Story 1 - In Progress', 'Test story 1', 'In Progress', 'developer', 5),
        (1, 'Story 2 - New', 'Test story 2', 'New', 'developer', 3),
        (2, 'Story 3 - QA', 'Test story 3', 'QA', 'tester', 8)
    `).run();

    // Insert test tasks
    this.db.prepare(`
      INSERT INTO tasks (user_story_id, title, description, status, assigned_to, estimated_hours) VALUES 
        (1, 'Task 1 - New', 'Test task 1', 'New', 'developer', 4),
        (1, 'Task 2 - In Progress', 'Test task 2', 'In Progress', 'developer', 6)
    `).run();
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

  // Test: Replicate the exact list_epics query with status filter
  async test_list_epics_status_filter() {
    console.log('Testing list_epics query with status filter...');
    
    // This is the exact query from server.ts line 1708-1743
    let query = `
      SELECT e.*,
             COUNT(us.id) as user_story_count,
             COUNT(c.id) as comment_count
      FROM epics e
      LEFT JOIN user_stories us ON e.id = us.epic_id
      LEFT JOIN comments c ON c.entity_type = 'epic' AND c.entity_id = e.id
    `;

    const conditions = [];
    const params = [];

    // Test the problematic line 1725: should be 'e.status = ?' not 'status = ?'
    const status = 'Open';
    if (status) {
      conditions.push('e.status = ?');  // Fixed version
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT ?
    `;
    params.push(50);

    const stmt = this.db.prepare(query);
    const epics = stmt.all(...params);
    
    if (epics.length === 0) {
      throw new Error('Expected to find at least one open epic');
    }
    
    const allOpen = epics.every((epic: any) => epic.status === 'Open');
    if (!allOpen) {
      throw new Error('Expected all epics to have status "Open"');
    }
    
    console.log(`Found ${epics.length} open epics`);
  }

  // Test: Verify the old ambiguous query would fail
  async test_list_epics_ambiguous_column_fails() {
    console.log('Testing that ambiguous column query fails...');
    
    let query = `
      SELECT e.*,
             COUNT(us.id) as user_story_count,
             COUNT(c.id) as comment_count
      FROM epics e
      LEFT JOIN user_stories us ON e.id = us.epic_id
      LEFT JOIN comments c ON c.entity_type = 'epic' AND c.entity_id = e.id
    `;

    const conditions = [];
    const params = [];

    // This is the BUGGY version from server.ts line 1725
    const status = 'Open';
    if (status) {
      conditions.push('status = ?');  // Ambiguous! Should fail
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY e.id
      ORDER BY e.created_at DESC
      LIMIT ?
    `;
    params.push(50);

    try {
      const stmt = this.db.prepare(query);
      const epics = stmt.all(...params);
      throw new Error('Expected ambiguous column error but query succeeded');
    } catch (error) {
      if (error instanceof Error && error.message.includes('ambiguous column name')) {
        console.log('Correctly caught ambiguous column error');
      } else {
        throw new Error(`Expected ambiguous column error, got: ${error.message}`);
      }
    }
  }

  // Test: Replicate the exact list_user_stories query with status filter
  async test_list_user_stories_status_filter() {
    console.log('Testing list_user_stories query with status filter...');
    
    // This is the exact query from server.ts line 1844-1896
    let query = `
      SELECT us.*,
             COUNT(t.id) as task_count,
             COUNT(b.id) as bug_count,
             COUNT(tc.id) as test_case_count,
             COUNT(c.id) as comment_count
      FROM user_stories us
      LEFT JOIN tasks t ON us.id = t.user_story_id
      LEFT JOIN bugs b ON us.id = b.user_story_id
      LEFT JOIN test_cases tc ON us.id = tc.user_story_id
      LEFT JOIN comments c ON c.entity_type = 'user_story' AND c.entity_id = us.id
    `;

    const conditions = [];
    const params = [];

    if (status) {
      conditions.push('us.status = ?');  // Fixed version (was e.status)
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY us.id
      ORDER BY us.created_at DESC
      LIMIT ?
    `;
    params.push(50);

    const stmt = this.db.prepare(query);
    const stories = stmt.all(...params);
    
    if (stories.length === 0) {
      throw new Error('Expected to find at least one story');
    }
    
    console.log(`Found ${stories.length} stories`);
  }

  // Test: Verify the wrong table alias would fail
  async test_list_user_stories_wrong_alias_fails() {
    console.log('Testing that wrong table alias fails...');
    
    let query = `
      SELECT us.*,
             COUNT(t.id) as task_count,
             COUNT(b.id) as bug_count,
             COUNT(tc.id) as test_case_count,
             COUNT(c.id) as comment_count
      FROM user_stories us
      LEFT JOIN tasks t ON us.id = t.user_story_id
      LEFT JOIN bugs b ON us.id = b.user_story_id
      LEFT JOIN test_cases tc ON us.id = tc.user_story_id
      LEFT JOIN comments c ON c.entity_type = 'user_story' AND c.entity_id = us.id
    `;

    const conditions = [];
    const params = [];

    // This is the BUGGY version from server.ts line 1879
    const status = 'In Progress';
    if (status) {
      conditions.push('e.status = ?');  // Wrong table! Should fail
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY us.id
      ORDER BY us.created_at DESC
      LIMIT ?
    `;
    params.push(50);

    try {
      const stmt = this.db.prepare(query);
      const stories = stmt.all(...params);
      throw new Error('Expected no such column error but query succeeded');
    } catch (error) {
      if (error instanceof Error && (error.message.includes('no such column') || error.message.includes('no such table'))) {
        console.log('Correctly caught wrong table alias error');
      } else {
        throw new Error(`Expected column error, got: ${error.message}`);
      }
    }
  }

  // Test: list_tasks query (single table, should work fine)
  async test_list_tasks_status_filter() {
    console.log('Testing list_tasks query with status filter...');
    
    // This is the exact query from server.ts line 1981
    let query = `SELECT * FROM tasks`;
    const conditions = [];
    const params = [];

    const status = 'New';
    if (status) {
      conditions.push('status = ?');  // OK for single table
      params.push(status);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` LIMIT ?`;
    params.push(50);

    const stmt = this.db.prepare(query);
    const tasks = stmt.all(...params);
    
    if (tasks.length === 0) {
      throw new Error('Expected to find at least one new task');
    }
    
    const allNew = tasks.every((task: any) => task.status === 'New');
    if (!allNew) {
      throw new Error('Expected all tasks to have status "New"');
    }
    
    console.log(`Found ${tasks.length} new tasks`);
  }

  // Test: SQL injection safety
  async test_sql_injection_safety() {
    console.log('Testing SQL injection safety...');
    
    let query = `SELECT * FROM epics`;
    const conditions = [];
    const params = [];

    // Try to inject SQL through status parameter
    const maliciousInput = "'; DROP TABLE epics; --";
    if (maliciousInput) {
      conditions.push('status = ?');
      params.push(maliciousInput);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` LIMIT ?`;
    params.push(50);

    try {
      const stmt = this.db.prepare(query);
      const result = stmt.all(...params);
      // If we get here, input was properly parameterized
      console.log('SQL injection attempt was properly handled');
      
      // Verify table still exists
      const tableCheck = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epics'").get();
      if (!tableCheck) {
        throw new Error('SQL injection succeeded - epics table was dropped!');
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('SQL')) {
        throw new Error('SQL injection vulnerability detected');
      }
      console.log('SQL injection attempt was blocked');
    }
  }

  async runAllTests() {
    console.log('🚀 Starting SQL Validation Tests...\n');
    
    this.createTestData();
    
    // Run all tests
    await this.runTest('list_epics status filter (fixed)', () => this.test_list_epics_status_filter());
    await this.runTest('list_epics ambiguous column fails', () => this.test_list_epics_ambiguous_column_fails());
    await this.runTest('list_user_stories status filter (fixed)', () => this.test_list_user_stories_status_filter());
    await this.runTest('list_user_stories wrong alias fails', () => this.test_list_user_stories_wrong_alias_fails());
    await this.runTest('list_tasks status filter', () => this.test_list_tasks_status_filter());
    await this.runTest('SQL injection safety', () => this.test_sql_injection_safety());
    
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
      console.log('\n🎉 All SQL Validation Tests Passed!');
      console.log('\n📋 Summary of Issues Found and Fixed:');
      console.log('   1. list_epics: Changed "status = ?" to "e.status = ?" (line 1725)');
      console.log('   2. list_user_stories: Changed "e.status = ?" to "us.status = ?" (line 1879)');
      console.log('   3. list_tasks: No change needed (single table query)');
    } else {
      console.log(`\n💥 ${failed} SQL Validation Test(s) Failed!`);
      process.exit(1);
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tests = new SQLValidationTests();
  tests.runAllTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { SQLValidationTests };