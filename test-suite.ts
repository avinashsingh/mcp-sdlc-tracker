import Database from 'better-sqlite3';

// Initialize test database
const db = new Database(':memory:');

// Create tables (same as server.ts)
db.exec(`
  -- Core SDLC Entities
  CREATE TABLE IF NOT EXISTS epics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Open', 'Closed')),
    created_by TEXT NOT NULL DEFAULT 'productmanager' CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    owner TEXT NOT NULL DEFAULT 'productmanager' CHECK (owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    assigned_to TEXT CHECK (assigned_to = 'productmanager'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS user_stories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    epic_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    acceptance_criteria TEXT,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'QA', 'UAT', 'Closed')),
    created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    current_owner TEXT NOT NULL DEFAULT 'productmanager' CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    assigned_to TEXT CHECK (assigned_to IN ('productmanager', 'architect', 'developer', 'tester')),
    story_points INTEGER,
    phase TEXT,
    phase_status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tester_at DATETIME,
    closed_at DATETIME,
    FOREIGN KEY (epic_id) REFERENCES epics(id)
  );

   CREATE TABLE IF NOT EXISTS tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_story_id INTEGER,
     title TEXT NOT NULL,
     description TEXT,
     status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Review', 'Closed')),
     created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
     current_owner TEXT NOT NULL DEFAULT 'architect' CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
     assigned_to TEXT CHECK (assigned_to IN ('architect', 'developer')),
     estimated_hours DECIMAL(5,2),
     actual_hours DECIMAL(5,2),
     phase TEXT,
     phase_status TEXT DEFAULT 'New',
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     closed_at DATETIME,
     FOREIGN KEY (user_story_id) REFERENCES user_stories(id)
   );

  CREATE TABLE IF NOT EXISTS bugs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_story_id INTEGER,
    task_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL CHECK (severity IN ('Critical', 'High', 'Medium', 'Low')),
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Fixed', 'Closed')),
    reported_by TEXT NOT NULL CHECK (reported_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    assigned_to TEXT CHECK (assigned_to IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    current_owner TEXT CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    phase TEXT,
    phase_status TEXT DEFAULT 'Open',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    fixed_at DATETIME,
    closed_at DATETIME,
    FOREIGN KEY (user_story_id) REFERENCES user_stories(id),
    FOREIGN KEY (task_id) REFERENCES tasks(id)
  );

  CREATE TABLE IF NOT EXISTS test_cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_story_id INTEGER,
    title TEXT NOT NULL,
    description TEXT,
    preconditions TEXT,
    steps TEXT NOT NULL,
    expected_result TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'Passed', 'Failed')),
    created_by TEXT NOT NULL DEFAULT 'tester' CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    current_owner TEXT NOT NULL DEFAULT 'tester' CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    assigned_to TEXT CHECK (assigned_to IN ('tester', 'productmanager')),
    phase TEXT,
    phase_status TEXT DEFAULT 'New',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_run_at DATETIME,
    last_run_by TEXT CHECK (last_run_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    FOREIGN KEY (user_story_id) REFERENCES user_stories(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
    entity_id INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    author TEXT NOT NULL CHECK (author IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS status_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
    entity_id INTEGER NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    transitioned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    transitioned_by TEXT NOT NULL CHECK (transitioned_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect'))
  );

  CREATE TABLE IF NOT EXISTS ownership_transitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
    entity_id INTEGER NOT NULL,
    from_owner TEXT CHECK (from_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    to_owner TEXT NOT NULL CHECK (to_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    transitioned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    transitioned_by TEXT NOT NULL CHECK (transitioned_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect'))
  );
`);

// Test suite
class TrackerTestSuite {
  private testResults: { test: string; passed: boolean; error?: string }[] = [];

  private log(message: string) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  private assert(condition: boolean, message: string) {
    if (!condition) {
      throw new Error(message);
    }
  }

  private recordTest(testName: string, passed: boolean, error?: string) {
    this.testResults.push({ test: testName, passed, error });
    this.log(`${passed ? '✅' : '❌'} ${testName}: ${passed ? 'PASSED' : 'FAILED'}${error ? ` - ${error}` : ''}`);
  }

  async testCreateEpics() {
    try {
      const stmt = db.prepare('INSERT INTO epics (title, description, assigned_to) VALUES (?, ?, ?)');

      const epics = [
        { title: 'Epic 1', description: 'Description 1', assigned_to: 'productmanager' },
        { title: 'Epic 2', description: 'Description 2', assigned_to: 'productmanager' }
      ];

      const results: Array<{ epic_id: number; title: string; success: boolean }> = [];
      for (const epic of epics) {
        const result = stmt.run(epic.title, epic.description, epic.assigned_to);
        results.push({ epic_id: result.lastInsertRowid as number, title: epic.title, success: true });
      }

      this.assert(results.length === 2, 'Should create 2 epics');
      this.assert(results[0].epic_id === 1, 'First epic should have ID 1');
      this.assert(results[1].epic_id === 2, 'Second epic should have ID 2');

      this.recordTest('testCreateEpics', true);
    } catch (error) {
      this.recordTest('testCreateEpics', false, error.message);
    }
  }

  async testCreateUserStories() {
    try {
      const stmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, story_points, assigned_to, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const userStories = [
        { epic_id: 1, title: 'US 1', description: 'Desc 1', acceptance_criteria: 'Criteria 1', story_points: 5, assigned_to: 'developer' },
        { epic_id: 1, title: 'US 2', description: 'Desc 2', acceptance_criteria: 'Criteria 2', story_points: 3, assigned_to: 'architect' }
      ];

      const results: Array<{ user_story_id: number; title: string; success: boolean }> = [];
      for (const userStory of userStories) {
        const result = stmt.run(
          userStory.epic_id, userStory.title, userStory.description,
          userStory.acceptance_criteria, userStory.story_points,
          userStory.assigned_to, 'productmanager'
        );
        results.push({ user_story_id: result.lastInsertRowid as number, title: userStory.title, success: true });
      }

      this.assert(results.length === 2, 'Should create 2 user stories');
      this.assert(results[0].user_story_id === 1, 'First user story should have ID 1');
      this.assert(results[1].user_story_id === 2, 'Second user story should have ID 2');

      this.recordTest('testCreateUserStories', true);
    } catch (error) {
      this.recordTest('testCreateUserStories', false, error.message);
    }
  }

  async testCreateTasks() {
    try {
      const stmt = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, estimated_hours, created_by)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

      const tasks = [
        { user_story_id: 1, title: 'Task 1', description: 'Task desc 1', assigned_to: 'developer', estimated_hours: 4 },
        { user_story_id: 2, title: 'Task 2', description: 'Task desc 2', assigned_to: 'architect', estimated_hours: 6 }
      ];

      const results: Array<{ task_id: number; title: string; success: boolean }> = [];
      for (const task of tasks) {
        const result = stmt.run(
          task.user_story_id, task.title, task.description,
          task.assigned_to, task.estimated_hours, 'architect'
        );
        results.push({ task_id: result.lastInsertRowid as number, title: task.title, success: true });
      }

      this.assert(results.length === 2, 'Should create 2 tasks');
      this.recordTest('testCreateTasks', true);
    } catch (error) {
      this.recordTest('testCreateTasks', false, error.message);
    }
  }

  async testCreateBugs() {
    try {
      const stmt = db.prepare(`
        INSERT INTO bugs (user_story_id, task_id, title, description, severity, reported_by, assigned_to, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const bugs = [
        { user_story_id: 1, task_id: 1, title: 'Bug 1', description: 'Bug desc 1', severity: 'High', reported_by: 'tester', assigned_to: 'developer' },
        { user_story_id: 2, task_id: null, title: 'Bug 2', description: 'Bug desc 2', severity: 'Medium', reported_by: 'developer', assigned_to: 'architect' }
      ];

      const results: Array<{ bug_id: number; title: string; success: boolean }> = [];
      for (const bug of bugs) {
        const result = stmt.run(
          bug.user_story_id, bug.task_id, bug.title, bug.description,
          bug.severity, bug.reported_by, bug.assigned_to, 'tester'
        );
        results.push({ bug_id: result.lastInsertRowid as number, title: bug.title, success: true });
      }

      this.assert(results.length === 2, 'Should create 2 bugs');
      this.recordTest('testCreateBugs', true);
    } catch (error) {
      this.recordTest('testCreateBugs', false, error.message);
    }
  }

  async testCreateTestCases() {
    try {
      const stmt = db.prepare(`
        INSERT INTO test_cases (user_story_id, title, description, preconditions, steps, expected_result, assigned_to)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const testCases = [
        {
          user_story_id: 1,
          title: 'Test Case 1',
          description: 'Test desc 1',
          preconditions: 'Pre 1',
          steps: 'Step 1',
          expected_result: 'Result 1',
          assigned_to: 'tester'
        },
        {
          user_story_id: 2,
          title: 'Test Case 2',
          description: 'Test desc 2',
          preconditions: 'Pre 2',
          steps: 'Step 2',
          expected_result: 'Result 2',
          assigned_to: 'productmanager'
        }
      ];

      const results: Array<{ test_case_id: number; title: string; success: boolean }> = [];
      for (const testCase of testCases) {
        const result = stmt.run(
          testCase.user_story_id, testCase.title, testCase.description,
          testCase.preconditions, testCase.steps, testCase.expected_result,
          testCase.assigned_to
        );
        results.push({ test_case_id: result.lastInsertRowid as number, title: testCase.title, success: true });
      }

      this.assert(results.length === 2, 'Should create 2 test cases');
      this.recordTest('testCreateTestCases', true);
    } catch (error) {
      this.recordTest('testCreateTestCases', false, error.message);
    }
  }

  async testCreateComments() {
    try {
      const stmt = db.prepare('INSERT INTO comments (entity_type, entity_id, comment_text, author) VALUES (?, ?, ?, ?)');

      const comments = [
        { entity_type: 'epic', entity_id: 1, comment_text: 'Comment 1', author: 'architect' },
        { entity_type: 'user_story', entity_id: 1, comment_text: 'Comment 2', author: 'developer' },
        { entity_type: 'task', entity_id: 1, comment_text: 'Comment 3', author: 'tester' }
      ];

      const results: Array<{ comment_id: number; entity_type: string; entity_id: number; success: boolean }> = [];
      for (const comment of comments) {
        const result = stmt.run(comment.entity_type, comment.entity_id, comment.comment_text, comment.author);
        results.push({ comment_id: result.lastInsertRowid as number, entity_type: comment.entity_type, entity_id: comment.entity_id, success: true });
      }

      this.assert(results.length === 3, 'Should create 3 comments');
      this.recordTest('testCreateComments', true);
    } catch (error) {
      this.recordTest('testCreateComments', false, error.message);
    }
  }

  async testListEpics() {
    try {
      const epics = db.prepare('SELECT * FROM epics ORDER BY id DESC').all();
      this.assert(epics.length === 2, 'Should list 2 epics');
      this.assert(epics[0].title === 'Epic 2', 'Should be ordered by ID DESC');
      this.recordTest('testListEpics', true);
    } catch (error) {
      this.recordTest('testListEpics', false, error.message);
    }
  }

  async testListUserStories() {
    try {
      const userStories = db.prepare('SELECT * FROM user_stories ORDER BY id DESC').all();
      this.assert(userStories.length === 2, 'Should list 2 user stories');
      this.assert(userStories[0].epic_id === 1, 'Should have correct epic_id');
      this.recordTest('testListUserStories', true);
    } catch (error) {
      this.recordTest('testListUserStories', false, error.message);
    }
  }

  async testListTasks() {
    try {
      const tasks = db.prepare('SELECT * FROM tasks ORDER BY id DESC').all();
      this.assert(tasks.length === 2, 'Should list 2 tasks');
      this.assert(tasks[0].assigned_to === 'architect', 'Should have correct assignment');
      this.recordTest('testListTasks', true);
    } catch (error) {
      this.recordTest('testListTasks', false, error.message);
    }
  }

  async testListBugs() {
    try {
      const bugs = db.prepare('SELECT * FROM bugs ORDER BY id DESC').all();
      this.assert(bugs.length === 2, 'Should list 2 bugs');
      this.assert(bugs[0].severity === 'Medium', 'Should have correct severity');
      this.recordTest('testListBugs', true);
    } catch (error) {
      this.recordTest('testListBugs', false, error.message);
    }
  }

  async testListTestCases() {
    try {
      const testCases = db.prepare('SELECT * FROM test_cases ORDER BY id DESC').all();
      this.assert(testCases.length === 2, 'Should list 2 test cases');
      this.assert(testCases[0].assigned_to === 'productmanager', 'Should have correct assignment');
      this.recordTest('testListTestCases', true);
    } catch (error) {
      this.recordTest('testListTestCases', false, error.message);
    }
  }

  async testUpdateEntityStatus() {
    try {
      // Update user story status
      const updateStmt = db.prepare('UPDATE user_stories SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const result = updateStmt.run('In Progress', 1);
      this.assert(result.changes === 1, 'Should update 1 user story');

      // Check status was updated
      const checkStmt = db.prepare('SELECT status FROM user_stories WHERE id = ?');
      const updated = checkStmt.get(1) as { status: string };
      this.assert(updated.status === 'In Progress', 'Status should be updated');

      // Record status transition
      const transitionStmt = db.prepare('INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, transitioned_by) VALUES (?, ?, ?, ?, ?)');
      transitionStmt.run('user_story', 1, 'New', 'In Progress', 'architect');

      this.recordTest('testUpdateEntityStatus', true);
    } catch (error) {
      this.recordTest('testUpdateEntityStatus', false, error.message);
    }
  }

  async testUpdateEntityAssignment() {
    try {
      // Update user story assignment
      const updateStmt = db.prepare('UPDATE user_stories SET assigned_to = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const result = updateStmt.run('architect', 1);
      this.assert(result.changes === 1, 'Should update 1 user story assignment');

      // Check assignment was updated
      const checkStmt = db.prepare('SELECT assigned_to FROM user_stories WHERE id = ?');
      const updated = checkStmt.get(1) as { assigned_to: string };
      this.assert(updated.assigned_to === 'architect', 'Assignment should be updated');

      // Record ownership transition
      const ownershipStmt = db.prepare('INSERT INTO ownership_transitions (entity_type, entity_id, from_owner, to_owner, transitioned_by) VALUES (?, ?, ?, ?, ?)');
      ownershipStmt.run('user_story', 1, 'developer', 'architect', 'productmanager');

      this.recordTest('testUpdateEntityAssignment', true);
    } catch (error) {
      this.recordTest('testUpdateEntityAssignment', false, error.message);
    }
  }

  async testUpdateTaskStatus() {
    try {
      const updateStmt = db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const result = updateStmt.run('In Progress', 1);
      this.assert(result.changes === 1, 'Should update 1 task');

      const checkStmt = db.prepare('SELECT status FROM tasks WHERE id = ?');
      const updated = checkStmt.get(1) as { status: string };
      this.assert(updated.status === 'In Progress', 'Task status should be updated');

      this.recordTest('testUpdateTaskStatus', true);
    } catch (error) {
      this.recordTest('testUpdateTaskStatus', false, error.message);
    }
  }

  async testUpdateTaskStatusToReview() {
    try {
      const updateStmt = db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const result = updateStmt.run('Review', 2);
      this.assert(result.changes === 1, 'Should update 1 task to Review status');

      const checkStmt = db.prepare('SELECT status FROM tasks WHERE id = ?');
      const updated = checkStmt.get(2) as { status: string };
      this.assert(updated.status === 'Review', 'Task status should be Review');

      this.recordTest('testUpdateTaskStatusToReview', true);
    } catch (error) {
      this.recordTest('testUpdateTaskStatusToReview', false, error.message);
    }
  }

  async testFiltering() {
    try {
      // Test epic status filtering
      const openEpics = db.prepare('SELECT * FROM epics WHERE status = ?').all('New');
      this.assert(openEpics.length === 2, 'Should find 2 new epics');

      // Test user story assignment filtering
      const architectStories = db.prepare('SELECT * FROM user_stories WHERE assigned_to = ?').all('architect');
      this.assert(architectStories.length === 2, 'Should find 2 architect-assigned stories');

      // Test bug severity filtering
      const highBugs = db.prepare('SELECT * FROM bugs WHERE severity = ?').all('High');
      this.assert(highBugs.length === 1, 'Should find 1 high severity bug');

      this.recordTest('testFiltering', true);
    } catch (error) {
      this.recordTest('testFiltering', false, error.message);
    }
  }

  async testForeignKeyConstraints() {
    try {
      // Try to create user story with non-existent epic
      const stmt = db.prepare('INSERT INTO user_stories (epic_id, title, created_by) VALUES (?, ?, ?)');
      try {
        stmt.run(999, 'Invalid Story', 'productmanager');
        throw new Error('Should have failed foreign key constraint');
      } catch (error) {
        // Expected to fail
        this.assert(error.message.includes('FOREIGN KEY'), 'Should fail foreign key constraint');
      }

      this.recordTest('testForeignKeyConstraints', true);
    } catch (error) {
      this.recordTest('testForeignKeyConstraints', false, error.message);
    }
  }

  async testPhaseFunctionality() {
    try {
      // Test phase filtering on user stories
      const userStories = db.prepare('SELECT * FROM user_stories WHERE phase = ?').all('Phase 1');
      this.assert(userStories.length === 0, 'Should find no user stories with Phase 1 initially');

      // Update a user story with phase
      const updateStmt = db.prepare('UPDATE user_stories SET phase = ?, phase_status = ? WHERE id = ?');
      updateStmt.run('Phase 1', 'In Progress', 1);

      // Test phase filtering
      const phaseStories = db.prepare('SELECT * FROM user_stories WHERE phase = ?').all('Phase 1');
      this.assert(phaseStories.length === 1, 'Should find 1 user story with Phase 1');
      this.assert(phaseStories[0].phase_status === 'In Progress', 'Should have correct phase status');

      // Test phase status filtering
      const statusStories = db.prepare('SELECT * FROM user_stories WHERE phase_status = ?').all('In Progress');
      this.assert(statusStories.length === 1, 'Should find 1 user story with In Progress phase status');

      this.recordTest('testPhaseFunctionality', true);
    } catch (error) {
      this.recordTest('testPhaseFunctionality', false, error.message);
    }
  }

  async runAllTests() {
    this.log('Starting Tracker Test Suite...');

    // Setup test data
    await this.testCreateEpics();
    await this.testCreateUserStories();
    await this.testCreateTasks();
    await this.testCreateBugs();
    await this.testCreateTestCases();
    await this.testCreateComments();

    // Test list operations
    await this.testListEpics();
    await this.testListUserStories();
    await this.testListTasks();
    await this.testListBugs();
    await this.testListTestCases();

    // Test update operations
    await this.testUpdateEntityStatus();
    await this.testUpdateEntityAssignment();
    await this.testUpdateTaskStatus();
    await this.testUpdateTaskStatusToReview();

    // Test advanced features
    await this.testFiltering();
    await this.testForeignKeyConstraints();
    await this.testPhaseFunctionality();

    // Summary
    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;

    this.log(`\nTest Summary: ${passed}/${total} tests passed`);

    if (passed === total) {
      this.log('🎉 All tests passed!');
    } else {
      this.log('❌ Some tests failed:');
      this.testResults.filter(r => !r.passed).forEach(r => {
        this.log(`  - ${r.test}: ${r.error}`);
      });
    }

    return { passed, total, results: this.testResults };
  }
}

// Run the test suite
async function main() {
  const suite = new TrackerTestSuite();
  try {
    const result = await suite.runAllTests();
    process.exit(result.passed === result.total ? 0 : 1);
  } catch (error) {
    console.error('Test suite failed:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();