#!/usr/bin/env node

/**
 * Simple SQL Validation Test
 * Demonstrates the SQL issues in server.ts by running the queries directly
 */

import Database from 'better-sqlite3';
import { createDatabaseSchema } from '../database-schema.ts';

const TEST_DB_PATH = './test-sql-simple.db';

console.log('🔧 Setting up test database...');
const db = new Database(TEST_DB_PATH);
createDatabaseSchema(db);

console.log('📝 Creating test data...');
db.prepare(`
  INSERT INTO epics (title, description, status, assigned_to) VALUES 
    ('Epic 1 - Open', 'Test epic 1', 'Open', 'productmanager'),
    ('Epic 2 - New', 'Test epic 2', 'New', 'productmanager'),
    ('Epic 3 - Closed', 'Test epic 3', 'Closed', 'productmanager')
`).run();

db.prepare(`
  INSERT INTO user_stories (epic_id, title, description, status, assigned_to, story_points) VALUES 
    (1, 'Story 1 - In Progress', 'Test story 1', 'In Progress', 'developer', 5),
    (1, 'Story 2 - New', 'Test story 2', 'New', 'developer', 3),
    (2, 'Story 3 - QA', 'Test story 3', 'QA', 'tester', 8)
`).run();

console.log('\n🧪 Testing SQL Queries...\n');

// Test 1: Demonstrate the BUGGY list_epics query (ambiguous column)
console.log('1. Testing BUGGY list_epics query (should fail with ambiguous column):');
try {
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

  const status = 'Open';
  if (status) {
    conditions.push('status = ?');  // BUGGY: Ambiguous column!
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` GROUP BY e.id ORDER BY e.created_at DESC LIMIT ?`;
  params.push(50);

  const stmt = db.prepare(query);
  const result = stmt.all(...params);
  console.log('❌ UNEXPECTED: Query succeeded (should have failed with ambiguous column error)');
} catch (error) {
  if (error.message.includes('ambiguous column name')) {
    console.log('✅ EXPECTED: Caught ambiguous column error:', error.message);
  } else {
    console.log('❌ UNEXPECTED ERROR:', error.message);
  }
}

// Test 2: Demonstrate the FIXED list_epics query
console.log('\n2. Testing FIXED list_epics query (should work):');
try {
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

  const status = 'Open';
  if (status) {
    conditions.push('e.status = ?');  // FIXED: Explicit table prefix
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` GROUP BY e.id ORDER BY e.created_at DESC LIMIT ?`;
  params.push(50);

  const stmt = db.prepare(query);
  const result = stmt.all(...params);
  console.log(`✅ SUCCESS: Found ${result.length} open epics`);
} catch (error) {
  console.log('❌ UNEXPECTED ERROR:', error.message);
}

// Test 3: Demonstrate the BUGGY list_user_stories query (wrong table alias)
console.log('\n3. Testing BUGGY list_user_stories query (should fail with wrong table):');
try {
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

  const status = 'In Progress';
  if (status) {
    conditions.push('e.status = ?');  // BUGGY: Wrong table alias!
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` GROUP BY us.id ORDER BY us.created_at DESC LIMIT ?`;
  params.push(50);

  const stmt = db.prepare(query);
  const result = stmt.all(...params);
  console.log('❌ UNEXPECTED: Query succeeded (should have failed with no such column error)');
} catch (error) {
  if (error.message.includes('no such column') || error.message.includes('no such table')) {
    console.log('✅ EXPECTED: Caught wrong table alias error:', error.message);
  } else {
    console.log('❌ UNEXPECTED ERROR:', error.message);
  }
}

// Test 4: Demonstrate the FIXED list_user_stories query
console.log('\n4. Testing FIXED list_user_stories query (should work):');
try {
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

  const status = 'In Progress';
  if (status) {
    conditions.push('us.status = ?');  // FIXED: Correct table alias
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` GROUP BY us.id ORDER BY us.created_at DESC LIMIT ?`;
  params.push(50);

  const stmt = db.prepare(query);
  const result = stmt.all(...params);
  console.log(`✅ SUCCESS: Found ${result.length} in-progress stories`);
} catch (error) {
  console.log('❌ UNEXPECTED ERROR:', error.message);
}

// Test 5: Demonstrate list_tasks query (should work fine - single table)
console.log('\n5. Testing list_tasks query (single table, should work):');
try {
  let query = `SELECT * FROM tasks`;
  const conditions = [];
  const params = [];

  const status = 'New';
  if (status) {
    conditions.push('status = ?');  // OK: Single table, no ambiguity
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  query += ` LIMIT ?`;
  params.push(50);

  const stmt = db.prepare(query);
  const result = stmt.all(...params);
  console.log(`✅ SUCCESS: Found ${result.length} new tasks`);
} catch (error) {
  console.log('❌ UNEXPECTED ERROR:', error.message);
}

console.log('\n📊 Summary:');
console.log('   Issues Found in server.ts:');
console.log('   1. Line 1725: "status = ?" should be "e.status = ?" (ambiguous column)');
console.log('   2. Line 1879: "e.status = ?" should be "us.status = ?" (wrong table alias)');
console.log('   3. list_tasks query is correct (single table, no ambiguity)');

console.log('\n🧹 Cleaning up...');
db.close();

try {
  const fs = await import('fs/promises');
  await fs.unlink(TEST_DB_PATH);
} catch (error) {
  // File might not exist, ignore
}

console.log('\n🎉 SQL validation test completed!');