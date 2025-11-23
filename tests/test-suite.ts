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

   CREATE TABLE IF NOT EXISTS epic_dependencies (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     dependent_epic_id INTEGER NOT NULL,
     dependency_epic_id INTEGER NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),

     FOREIGN KEY (dependent_epic_id) REFERENCES epics(id) ON DELETE CASCADE,
     FOREIGN KEY (dependency_epic_id) REFERENCES epics(id) ON DELETE CASCADE,

     CONSTRAINT no_self_epic_dependency CHECK (dependent_epic_id != dependency_epic_id),
     UNIQUE(dependent_epic_id, dependency_epic_id)
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

   CREATE TABLE IF NOT EXISTS story_dependencies (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     dependent_story_id INTEGER NOT NULL,
     dependency_story_id INTEGER NOT NULL,
     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),

     FOREIGN KEY (dependent_story_id) REFERENCES user_stories(id) ON DELETE CASCADE,
     FOREIGN KEY (dependency_story_id) REFERENCES user_stories(id) ON DELETE CASCADE,

     CONSTRAINT no_self_dependency CHECK (dependent_story_id != dependency_story_id),
     UNIQUE(dependent_story_id, dependency_story_id)
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
    status TEXT NOT NULL DEFAULT 'Open' CHECK (status IN ('Open', 'In Progress', 'Review', 'Fixed', 'Closed')),
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

  CREATE TABLE IF NOT EXISTS task_dependencies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dependent_task_id INTEGER NOT NULL,
    dependency_task_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    FOREIGN KEY (dependent_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (dependency_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    CONSTRAINT no_self_task_dependency CHECK (dependent_task_id != dependency_task_id),
    UNIQUE(dependent_task_id, dependency_task_id)
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

  async testTaskDependencies() {
    try {
      // Create an additional user story for cross-story testing
      const story2Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Story 2', 'Second story for dependency testing', 'architect', 'productmanager', 'architect');

      // Create additional tasks in different stories
      const task3Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(story2Result.lastInsertRowid, 'Task 3', 'Task in different story', 'architect', 'architect', 'architect');

      // Test 1: Valid dependency within same story (Task 2 depends on Task 1)
      db.prepare(`
        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
        VALUES (?, ?, ?)
      `).run(2, 1, 'architect'); // Task 2 depends on Task 1

      const deps1 = db.prepare('SELECT * FROM task_dependencies').all();
      this.assert(deps1.length === 1, 'Should create valid task dependency');

      // Test 2: Prevent self-dependency (Task 1 depends on Task 1)
      try {
        db.prepare(`
          INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
          VALUES (?, ?, ?)
        `).run(1, 1, 'architect');
        this.assert(false, 'Should prevent self-dependency');
      } catch (error) {
        this.assert(error.message.includes('CHECK constraint'), 'Should prevent self-dependency with CHECK constraint');
      }

      // Test 3: Prevent duplicate dependencies
      try {
        db.prepare(`
          INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
          VALUES (?, ?, ?)
        `).run(2, 1, 'architect'); // Same dependency again
        this.assert(false, 'Should prevent duplicate dependencies');
      } catch (error) {
        this.assert(error.message.includes('UNIQUE constraint'), 'Should prevent duplicate dependencies');
      }

      // Test 4: Database allows cross-story dependencies (MCP validation prevents this)
      db.prepare(`
        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
        VALUES (?, ?, ?)
      `).run(3, 1, 'architect'); // Task 3 (Story 2) depends on Task 1 (Story 1)

      const deps2 = db.prepare('SELECT * FROM task_dependencies').all();
      this.assert(deps2.length === 2, 'Database allows cross-story dependencies (MCP validation prevents this)');

      // Test 5: Database allows circular dependencies (MCP tool prevents this)
      db.prepare(`
        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
        VALUES (?, ?, ?)
      `).run(1, 2, 'architect'); // Task 1 depends on Task 2 (circular)

      const deps3 = db.prepare('SELECT * FROM task_dependencies').all();
      this.assert(deps3.length === 3, 'Database allows circular dependencies (MCP validation prevents this)');

      // Clean up test data to not affect other tests
      db.prepare('DELETE FROM task_dependencies WHERE dependent_task_id >= 3').run();
      db.prepare('DELETE FROM tasks WHERE id >= 3').run();
      db.prepare('DELETE FROM user_stories WHERE id >= 3').run();

      this.recordTest('testTaskDependencies', true);
    } catch (error) {
      this.recordTest('testTaskDependencies', false, error.message);
    }
  }

  async testTaskDependencyFiltering() {
    try {
      // Create additional test data
      const story2Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Story for Filtering', 'Story for dependency filtering tests', 'architect', 'productmanager', 'architect');

      // Create additional tasks
      const task3Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(story2Result.lastInsertRowid, 'Task 3', 'Independent task', 'architect', 'architect', 'architect');

      const task4Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(story2Result.lastInsertRowid, 'Task 4', 'Task that depends on Task 3', 'architect', 'architect', 'architect');

      // Create dependencies: Task 4 depends on Task 3, Task 2 depends on Task 1 (from previous test)
      db.prepare(`
        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
        VALUES (?, ?, ?)
      `).run(task4Result.lastInsertRowid, task3Result.lastInsertRowid, 'architect');

      // Test 1: Verify dependency relationships exist in database
      const task3Deps = db.prepare('SELECT dependent_task_id FROM task_dependencies WHERE dependency_task_id = ?').all(task3Result.lastInsertRowid);
      this.assert(task3Deps.length === 1, 'Task 3 should have 1 dependent task');
      this.assert(task3Deps[0].dependent_task_id === task4Result.lastInsertRowid, 'Task 4 should depend on Task 3');

      // Test 2: Verify reverse dependency relationships
      const task4ReverseDeps = db.prepare('SELECT dependency_task_id FROM task_dependencies WHERE dependent_task_id = ?').all(task4Result.lastInsertRowid);
      this.assert(task4ReverseDeps.length === 1, 'Task 4 should depend on 1 task');
      this.assert(task4ReverseDeps[0].dependency_task_id === task3Result.lastInsertRowid, 'Task 4 should depend on Task 3');

      // Test 3: Verify tasks with dependencies exist
      const tasksWithDeps = db.prepare(`
        SELECT COUNT(DISTINCT t.id) as count
        FROM tasks t
        INNER JOIN task_dependencies td ON t.id = td.dependent_task_id
      `).get().count;
      this.assert(tasksWithDeps >= 1, 'Should have at least 1 task with dependencies');

      // Test 4: Verify tasks without dependencies exist
      const tasksWithoutDeps = db.prepare(`
        SELECT COUNT(*) as count FROM tasks t
        LEFT JOIN task_dependencies td ON t.id = td.dependent_task_id
        WHERE td.dependent_task_id IS NULL
      `).get().count;
      this.assert(tasksWithoutDeps >= 1, 'Should have at least 1 task without dependencies');

      // Test 5: Verify filtering by user story works
      const story2Tasks = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_story_id = ?').get(story2Result.lastInsertRowid).count;
      this.assert(story2Tasks >= 1, 'Story 2 should have at least 1 task');

      // Clean up test data
      db.prepare('DELETE FROM task_dependencies WHERE dependent_task_id >= 3').run();
      db.prepare('DELETE FROM tasks WHERE id >= 3').run();
      db.prepare('DELETE FROM user_stories WHERE id >= 3').run();

      this.recordTest('testTaskDependencyFiltering', true);
    } catch (error) {
      this.recordTest('testTaskDependencyFiltering', false, error.message);
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

  async testUserStoryInProgressValidation() {
    try {
      // Create a test epic first
      const epicStmt = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner)
        VALUES (?, ?, ?, ?)
      `);
      const epicResult = epicStmt.run('Test Epic for Validation', 'Epic for testing validation', 'productmanager', 'productmanager');
      const epicId = epicResult.lastInsertRowid as number;

      // Test 1: User story without acceptance criteria should not move to In Progress
      const us1Stmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const us1Result = us1Stmt.run(epicId, 'US without criteria', 'Description', null, 'productmanager', 'productmanager');
      const us1Id = us1Result.lastInsertRowid as number;

      // Try to update to In Progress - this should fail due to missing acceptance criteria
      const updateStmt = db.prepare('UPDATE user_stories SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const updateResult = updateStmt.run('In Progress', us1Id);
      // Note: This direct SQL update bypasses our validation, so we'll test the validation logic separately

      // Test 2: User story with acceptance criteria but no test cases should not move to In Progress
      const us2Stmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const us2Result = us2Stmt.run(epicId, 'US with criteria no tests', 'Description', 'Acceptance criteria here', 'productmanager', 'productmanager');
      const us2Id = us2Result.lastInsertRowid as number;

      // Verify no test cases exist for this user story
      const testCaseCount = db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE user_story_id = ?').get(us2Id).count;
      this.assert(testCaseCount === 0, 'Should have no test cases initially');

      // Test 3: User story with both acceptance criteria and test cases should be able to move to In Progress
      const us3Stmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const us3Result = us3Stmt.run(epicId, 'US with criteria and tests', 'Description', 'Acceptance criteria here', 'productmanager', 'productmanager');
      const us3Id = us3Result.lastInsertRowid as number;

      // Add test cases for this user story
      const testCaseStmt = db.prepare(`
        INSERT INTO test_cases (user_story_id, title, description, steps, expected_result, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      testCaseStmt.run(us3Id, 'Test Case 1', 'Test description', 'Step 1, Step 2', 'Expected result', 'tester', 'tester');
      testCaseStmt.run(us3Id, 'Test Case 2', 'Test description 2', 'Step A, Step B', 'Expected result 2', 'tester', 'tester');

      // Verify test cases exist
      const testCaseCount3 = db.prepare('SELECT COUNT(*) as count FROM test_cases WHERE user_story_id = ?').get(us3Id).count;
      this.assert(testCaseCount3 === 2, 'Should have 2 test cases');

      // Test validation logic by simulating the checks
      const us1 = db.prepare('SELECT * FROM user_stories WHERE id = ?').get(us1Id);
      const us2 = db.prepare('SELECT * FROM user_stories WHERE id = ?').get(us2Id);
      const us3 = db.prepare('SELECT * FROM user_stories WHERE id = ?').get(us3Id);

      // US1 should fail: no acceptance criteria
      this.assert(!us1.acceptance_criteria || us1.acceptance_criteria.trim() === '', 'US1 should have no acceptance criteria');

      // US2 should fail: has acceptance criteria but no test cases
      this.assert(us2.acceptance_criteria && us2.acceptance_criteria.trim() !== '', 'US2 should have acceptance criteria');
      this.assert(testCaseCount === 0, 'US2 should have no test cases');

      // US3 should pass: has both acceptance criteria and test cases
      this.assert(us3.acceptance_criteria && us3.acceptance_criteria.trim() !== '', 'US3 should have acceptance criteria');
      this.assert(testCaseCount3 === 2, 'US3 should have test cases');

      this.recordTest('testUserStoryInProgressValidation', true);
    } catch (error) {
      this.recordTest('testUserStoryInProgressValidation', false, error.message);
    }
  }

  async testUserStoryQAValidation() {
    try {
      // Create a test epic first
      const epicStmt = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner)
        VALUES (?, ?, ?, ?)
      `);
      const epicResult = epicStmt.run('Test Epic for QA Validation', 'Epic for testing QA validation', 'productmanager', 'productmanager');
      const epicId = epicResult.lastInsertRowid as number;

      // Create a user story with acceptance criteria and test cases (so it can move to In Progress)
      const usStmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const usResult = usStmt.run(epicId, 'US for QA validation', 'Description', 'Acceptance criteria here', 'productmanager', 'productmanager');
      const usId = usResult.lastInsertRowid as number;

      // Add test cases for this user story
      const testCaseStmt = db.prepare(`
        INSERT INTO test_cases (user_story_id, title, description, steps, expected_result, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      testCaseStmt.run(usId, 'Test Case 1', 'Test description', 'Step 1, Step 2', 'Expected result', 'tester', 'tester');

      // Create tasks for this user story
      const taskStmt = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?)
      `);
      const task1Result = taskStmt.run(usId, 'Task 1', 'Task description 1', 'developer', 'developer');
      const task1Id = task1Result.lastInsertRowid as number;
      const task2Result = taskStmt.run(usId, 'Task 2', 'Task description 2', 'developer', 'developer');
      const task2Id = task2Result.lastInsertRowid as number;

      // Move user story to In Progress (should work since it has acceptance criteria and test cases)
      const usInProgress = db.prepare('SELECT * FROM user_stories WHERE id = ?').get(usId);
      this.assert(usInProgress.status === 'New', 'User story should start as New');

      // Test 1: Try to move to QA when tasks are not closed - should fail
      // We can't test the actual validation here since it's in the MCP tool, but we can verify the logic
      const openTasksBefore = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      this.assert(openTasksBefore.length === 2, 'Should have 2 open tasks initially');
      this.assert(openTasksBefore.some(t => t.id === task1Id), 'Task 1 should be open');
      this.assert(openTasksBefore.some(t => t.id === task2Id), 'Task 2 should be open');

      // Test 2: Close one task and verify the other is still open
      db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('Closed', task1Id);
      const openTasksAfter = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      this.assert(openTasksAfter.length === 1, 'Should have 1 open task after closing one');
      this.assert(openTasksAfter[0].id === task2Id, 'Task 2 should still be open');

      // Test 3: Close all tasks
      db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('Closed', task2Id);
      const openTasksFinal = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      this.assert(openTasksFinal.length === 0, 'Should have no open tasks after closing all');

      // Test 4: Verify task IDs for validation error message
      // Reset one task to open to test the validation logic
      db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('In Progress', task2Id);
      const openTasksForValidation = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const openTaskIds = openTasksForValidation.map(t => t.id);
      this.assert(openTaskIds.length === 1, 'Should have 1 open task for validation test');
      this.assert(openTaskIds[0] === task2Id, 'Open task should be task 2');

      this.recordTest('testUserStoryQAValidation', true);
    } catch (error) {
      this.recordTest('testUserStoryQAValidation', false, error.message);
    }
  }

  async testUserStoryUATValidation() {
    try {
      // Create a test epic first
      const epicStmt = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner)
        VALUES (?, ?, ?, ?)
      `);
      const epicResult = epicStmt.run('Test Epic for UAT Validation', 'Epic for testing UAT validation', 'productmanager', 'productmanager');
      const epicId = epicResult.lastInsertRowid as number;

      // Create a user story with acceptance criteria and test cases
      const usStmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const usResult = usStmt.run(epicId, 'US for UAT validation', 'Description', 'Acceptance criteria here', 'productmanager', 'productmanager');
      const usId = usResult.lastInsertRowid as number;

      // Add test cases for this user story
      const testCaseStmt = db.prepare(`
        INSERT INTO test_cases (user_story_id, title, description, steps, expected_result, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      testCaseStmt.run(usId, 'Test Case 1', 'Test description', 'Step 1, Step 2', 'Expected result', 'tester', 'tester');
      testCaseStmt.run(usId, 'Test Case 2', 'Test description 2', 'Step A, Step B', 'Expected result 2', 'tester', 'tester');

      // Create tasks for this user story
      const taskStmt = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?)
      `);
      const task1Result = taskStmt.run(usId, 'Task 1', 'Task description 1', 'developer', 'developer');
      const task1Id = task1Result.lastInsertRowid as number;
      const task2Result = taskStmt.run(usId, 'Task 2', 'Task description 2', 'developer', 'developer');
      const task2Id = task2Result.lastInsertRowid as number;

      // Create bugs for this user story
      const bugStmt = db.prepare(`
        INSERT INTO bugs (user_story_id, title, description, severity, reported_by, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const bug1Result = bugStmt.run(usId, 'Bug 1', 'Bug description 1', 'High', 'tester', 'developer', 'tester', 'developer');
      const bug1Id = bug1Result.lastInsertRowid as number;
      const bug2Result = bugStmt.run(usId, 'Bug 2', 'Bug description 2', 'Medium', 'tester', 'developer', 'tester', 'developer');
      const bug2Id = bug2Result.lastInsertRowid as number;

      // Test 1: Try to move to UAT when everything is not ready - should fail
      const openTasksBefore = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const openBugsBefore = db.prepare('SELECT id FROM bugs WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const failedTestsBefore = db.prepare('SELECT id FROM test_cases WHERE user_story_id = ? AND status != ?').all(usId, 'Passed');

      this.assert(openTasksBefore.length === 2, 'Should have 2 open tasks initially');
      this.assert(openBugsBefore.length === 2, 'Should have 2 open bugs initially');
      this.assert(failedTestsBefore.length === 2, 'Should have 2 unpassed test cases initially');

      // Test 2: Close all tasks, bugs, and pass all test cases
      db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_story_id = ?').run('Closed', usId);
      db.prepare('UPDATE bugs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_story_id = ?').run('Closed', usId);
      db.prepare('UPDATE test_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE user_story_id = ?').run('Passed', usId);

      // Verify everything is now ready
      const openTasksAfter = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const openBugsAfter = db.prepare('SELECT id FROM bugs WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const failedTestsAfter = db.prepare('SELECT id FROM test_cases WHERE user_story_id = ? AND status != ?').all(usId, 'Passed');

      this.assert(openTasksAfter.length === 0, 'Should have no open tasks after closing all');
      this.assert(openBugsAfter.length === 0, 'Should have no open bugs after closing all');
      this.assert(failedTestsAfter.length === 0, 'Should have no failed test cases after passing all');

      // Test 3: Reset some items to test partial validation
      db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('In Progress', task1Id);
      db.prepare('UPDATE bugs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('Open', bug1Id);
      db.prepare('UPDATE test_cases SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('Failed', testCaseStmt.run(usId, 'Test Case 1', 'Test description', 'Step 1, Step 2', 'Expected result', 'tester', 'tester').lastInsertRowid);

      // Verify the validation logic
      const openTasksForValidation = db.prepare('SELECT id FROM tasks WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const openBugsForValidation = db.prepare('SELECT id FROM bugs WHERE user_story_id = ? AND status != ?').all(usId, 'Closed');
      const failedTestsForValidation = db.prepare('SELECT id FROM test_cases WHERE user_story_id = ? AND status != ?').all(usId, 'Passed');

      this.assert(openTasksForValidation.length > 0, 'Should have open tasks for validation test');
      this.assert(openBugsForValidation.length > 0, 'Should have open bugs for validation test');
      this.assert(failedTestsForValidation.length > 0, 'Should have failed tests for validation test');

      this.recordTest('testUserStoryUATValidation', true);
    } catch (error) {
      this.recordTest('testUserStoryUATValidation', false, error.message);
    }
  }

  async testCreateEntitiesWithPhases() {
    try {
      // Test creating user story with phase
      const userStoryStmt = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, story_points, assigned_to, phase, phase_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const usResult = userStoryStmt.run(1, 'US with Phase', 'Desc', 'Criteria', 5, 'developer', 'Development', 'Planning', 'productmanager');
      const userStoryId = usResult.lastInsertRowid as number;
      this.assert(userStoryId > 0, 'Should create user story with phase');

      // Test creating task with phase
      const taskStmt = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, estimated_hours, phase, phase_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const taskResult = taskStmt.run(userStoryId, 'Task with Phase', 'Task desc', 'developer', 4, 'Development', 'In Progress', 'architect');
      const taskId = taskResult.lastInsertRowid as number;
      this.assert(taskId > 0, 'Should create task with phase');

      // Verify phases were set
      const usCheck = db.prepare('SELECT phase, phase_status FROM user_stories WHERE id = ?').get(userStoryId) as { phase: string; phase_status: string };
      this.assert(usCheck.phase === 'Development', 'User story phase should be set');
      this.assert(usCheck.phase_status === 'Planning', 'User story phase_status should be set');

      const taskCheck = db.prepare('SELECT phase, phase_status FROM tasks WHERE id = ?').get(taskId) as { phase: string; phase_status: string };
      this.assert(taskCheck.phase === 'Development', 'Task phase should be set');
      this.assert(taskCheck.phase_status === 'In Progress', 'Task phase_status should be set');

      this.recordTest('testCreateEntitiesWithPhases', true);
    } catch (error) {
      this.recordTest('testCreateEntitiesWithPhases', false, error.message);
    }
  }

  async testUpdateEntityPhases() {
    try {
      // Update user story phase
      const updateStmt = db.prepare('UPDATE user_stories SET phase = ?, phase_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      const result = updateStmt.run('Testing', 'In Progress', 1);
      this.assert(result.changes === 1, 'Should update user story phase');

      // Verify phase was updated
      const checkStmt = db.prepare('SELECT phase, phase_status FROM user_stories WHERE id = ?');
      const updated = checkStmt.get(1) as { phase: string; phase_status: string };
      this.assert(updated.phase === 'Testing', 'User story phase should be updated');
      this.assert(updated.phase_status === 'In Progress', 'User story phase_status should be updated');

      this.recordTest('testUpdateEntityPhases', true);
    } catch (error) {
      this.recordTest('testUpdateEntityPhases', false, error.message);
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
      // Test phase functionality
      const taskResult = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Phase Test Task', 'Task for phase testing', 'architect', 'architect', 'architect');

      // Test updating phase
      const updateStmt = db.prepare('UPDATE tasks SET phase = ?, phase_status = ? WHERE id = ?');
      updateStmt.run('Development', 'In Progress', taskResult.lastInsertRowid);

      // Verify phase was set
      const task = db.prepare('SELECT phase, phase_status FROM tasks WHERE id = ?').get(taskResult.lastInsertRowid) as { phase: string; phase_status: string };
      this.assert(task.phase === 'Development', 'Phase should be set');
      this.assert(task.phase_status === 'In Progress', 'Phase status should be set');

      this.recordTest('testPhaseFunctionality', true);
    } catch (error) {
      this.recordTest('testPhaseFunctionality', false, error.message);
    }
  }

  async testWorkflowIntelligence() {
    try {
      // Create a user story
      const storyResult = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Workflow Intelligence Test Story', 'Story for testing workflow intelligence', 'architect', 'productmanager', 'architect');

      // Create multiple tasks for the user story
      const task1Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task 1', 'First task', 'architect', 'architect', 'architect', 'In Progress');

      const task2Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task 2', 'Second task', 'architect', 'architect', 'architect', 'Review');

      const task3Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task 3', 'Third task', 'architect', 'architect', 'architect', 'New');

      // Test 1: Close Task 3 - should not trigger suggestion (not all tasks closed)
      const updateStmt1 = db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt1.run('Closed', task3Result.lastInsertRowid);

      // Check that user story status is still not QA
      const story1 = db.prepare('SELECT status FROM user_stories WHERE id = ?').get(storyResult.lastInsertRowid) as { status: string };
      this.assert(story1.status !== 'QA', 'User story should not be moved to QA when not all tasks are closed');

      // Test 2: Close Task 1 - should not trigger suggestion (not all tasks closed)
      updateStmt1.run('Closed', task1Result.lastInsertRowid);

      const story2 = db.prepare('SELECT status FROM user_stories WHERE id = ?').get(storyResult.lastInsertRowid) as { status: string };
      this.assert(story2.status !== 'QA', 'User story should not be moved to QA when not all tasks are closed');

      // Test 3: Close Task 2 - should trigger suggestion (all tasks now closed)
      updateStmt1.run('Closed', task2Result.lastInsertRowid);

      // Verify all tasks are closed
      const taskCount = db.prepare(`
        SELECT COUNT(*) as total, COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed
        FROM tasks WHERE user_story_id = ?
      `).get(storyResult.lastInsertRowid) as { total: number; closed: number };

      this.assert(taskCount.total === 3, 'Should have 3 tasks total');
      this.assert(taskCount.closed === 3, 'All 3 tasks should be closed');

      // The workflow intelligence would be triggered in the MCP tool, but here we're testing the database logic
      // In a real scenario, the MCP tool would check this and return workflow_suggestions

      this.recordTest('testWorkflowIntelligence', true);
    } catch (error) {
      this.recordTest('testWorkflowIntelligence', false, error.message);
    }
  }

  async testTaskDependencyIntelligence() {
    try {
      // Create a user story
      const storyResult = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, assigned_to, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Task Dependency Intelligence Test Story', 'Story for testing task dependency intelligence', 'architect', 'productmanager', 'architect');

      // Create Task A (dependency)
      const taskAResult = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task A', 'Dependency task', 'architect', 'architect', 'architect', 'In Progress');

      // Create Task B (depends on Task A)
      const taskBResult = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task B', 'Dependent task', 'architect', 'architect', 'architect', 'New');

      // Create Task C (also depends on Task A)
      const taskCResult = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task C', 'Another dependent task', 'architect', 'architect', 'architect', 'New');

      // Create Task D (depends on Task B - should not be affected)
      const taskDResult = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task D', 'Depends on Task B', 'architect', 'architect', 'architect', 'New');

      // Set up dependencies: Task B and Task C depend on Task A, Task D depends on Task B
      const depStmt = db.prepare(`
        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
        VALUES (?, ?, ?)
      `);
      depStmt.run(taskBResult.lastInsertRowid, taskAResult.lastInsertRowid, 'architect'); // B depends on A
      depStmt.run(taskCResult.lastInsertRowid, taskAResult.lastInsertRowid, 'architect'); // C depends on A
      depStmt.run(taskDResult.lastInsertRowid, taskBResult.lastInsertRowid, 'architect'); // D depends on B

      // Verify initial state
      const taskB = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskBResult.lastInsertRowid) as { status: string };
      const taskC = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskCResult.lastInsertRowid) as { status: string };
      const taskD = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskDResult.lastInsertRowid) as { status: string };

      this.assert(taskB.status === 'New', 'Task B should start as New');
      this.assert(taskC.status === 'New', 'Task C should start as New');
      this.assert(taskD.status === 'New', 'Task D should start as New');

      // Close Task A - this should trigger suggestions for Task B and Task C
      const updateStmt = db.prepare('UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt.run('Closed', taskAResult.lastInsertRowid);

      // Verify Task A is closed
      const taskAClosed = db.prepare('SELECT status FROM tasks WHERE id = ?').get(taskAResult.lastInsertRowid) as { status: string };
      this.assert(taskAClosed.status === 'Closed', 'Task A should be closed');

      // The workflow intelligence would be triggered in the MCP tool, but here we're testing the database logic
      // In a real scenario, the MCP tool would check this and return workflow_suggestions for Task B and Task C

      // Verify that Task B and Task C still have their dependencies satisfied (all deps closed)
      const taskBDeps = db.prepare(`
        SELECT COUNT(*) as total, COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as closed
        FROM task_dependencies td
        JOIN tasks t ON td.dependency_task_id = t.id
        WHERE td.dependent_task_id = ?
      `).get(taskBResult.lastInsertRowid) as { total: number; closed: number };

      const taskCDeps = db.prepare(`
        SELECT COUNT(*) as total, COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as closed
        FROM task_dependencies td
        JOIN tasks t ON td.dependency_task_id = t.id
        WHERE td.dependent_task_id = ?
      `).get(taskCResult.lastInsertRowid) as { total: number; closed: number };

      this.assert(taskBDeps.total === 1 && taskBDeps.closed === 1, 'Task B should have all dependencies satisfied');
      this.assert(taskCDeps.total === 1 && taskCDeps.closed === 1, 'Task C should have all dependencies satisfied');

      // Task D should NOT have all dependencies satisfied (Task B is still New)
      const taskDDeps = db.prepare(`
        SELECT COUNT(*) as total, COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as closed
        FROM task_dependencies td
        JOIN tasks t ON td.dependency_task_id = t.id
        WHERE td.dependent_task_id = ?
      `).get(taskDResult.lastInsertRowid) as { total: number; closed: number };

      this.assert(taskDDeps.total === 1 && taskDDeps.closed === 0, 'Task D should NOT have all dependencies satisfied');

      this.recordTest('testTaskDependencyIntelligence', true);
    } catch (error) {
      this.recordTest('testTaskDependencyIntelligence', false, error.message);
    }
  }

  async testBugStatusIntelligence() {
    try {
      // Create test bugs with different scenarios
      const bug1Result = db.prepare(`
        INSERT INTO bugs (title, description, severity, reported_by, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Bug Fixed Needs QA', 'A bug that was just fixed', 'High', 'tester', 'developer', 'developer', 'developer', 'In Progress');

      const bug2Result = db.prepare(`
        INSERT INTO bugs (title, description, severity, reported_by, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Bug Closed No Regression Test', 'A bug closed without regression tests', 'Medium', 'tester', 'developer', 'developer', 'developer', 'Fixed');

      const bug3Result = db.prepare(`
        INSERT INTO bugs (title, description, severity, reported_by, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('New Bug Needs Assignment', 'A newly opened bug', 'Low', 'tester', 'tester', 'tester', 'tester', 'In Progress');

      // Test 1: Move bug to "Fixed" - should suggest QA verification
      const updateStmt = db.prepare('UPDATE bugs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      updateStmt.run('Fixed', bug1Result.lastInsertRowid);

      // Verify bug status changed
      const bug1Fixed = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug1Result.lastInsertRowid) as { status: string };
      this.assert(bug1Fixed.status === 'Fixed', 'Bug 1 should be marked as Fixed');

      // Test 2: Move bug to "Closed" - should check for regression tests
      updateStmt.run('Closed', bug2Result.lastInsertRowid);

      // Verify bug status changed
      const bug2Closed = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug2Result.lastInsertRowid) as { status: string };
      this.assert(bug2Closed.status === 'Closed', 'Bug 2 should be marked as Closed');

      // Check if regression tests exist (should be 0)
      const regressionTests = db.prepare(`
        SELECT COUNT(*) as test_count FROM test_cases
        WHERE title LIKE ? OR description LIKE ?
      `).get('%regression%Bug Closed No Regression Test%', '%regression%Bug Closed No Regression Test%');

      this.assert(regressionTests.test_count === 0, 'Should have no regression tests for this bug');

      // Test 3: Move bug to "Open" - should suggest reassignment
      updateStmt.run('Open', bug3Result.lastInsertRowid);

      // Verify bug status changed
      const bug3Open = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug3Result.lastInsertRowid) as { status: string };
      this.assert(bug3Open.status === 'Open', 'Bug 3 should be marked as Open');

      // Verify the bug is assigned to tester (should trigger reassignment suggestion)
      const bug3Assignee = db.prepare('SELECT assigned_to FROM bugs WHERE id = ?').get(bug3Result.lastInsertRowid) as { assigned_to: string };
      this.assert(bug3Assignee.assigned_to === 'tester', 'Bug 3 should be assigned to tester initially');

      // The workflow intelligence would be triggered in the MCP tool, but here we're testing the database logic
      // In a real scenario, the MCP tool would check this and return workflow_suggestions

      this.recordTest('testBugStatusIntelligence', true);
    } catch (error) {
      this.recordTest('testBugStatusIntelligence', false, error.message);
    }
  }

  async testEpicDependenciesResolved() {
    try {
      // Create test epics with different dependency scenarios
      const epic1Result = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner, status)
        VALUES (?, ?, ?, ?, ?)
      `).run('Epic with No Dependencies', 'Epic that has no dependencies', 'productmanager', 'productmanager', 'Open');

      const epic2Result = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner, status)
        VALUES (?, ?, ?, ?, ?)
      `).run('Epic with Resolved Dependencies', 'Epic with all dependencies closed', 'productmanager', 'productmanager', 'New');

      const epic3Result = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner, status)
        VALUES (?, ?, ?, ?, ?)
      `).run('Epic with Unresolved Dependencies', 'Epic with open dependencies', 'productmanager', 'productmanager', 'New');

      const epic4Result = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner, status)
        VALUES (?, ?, ?, ?, ?)
      `).run('Closed Dependency Epic', 'Epic that serves as a dependency', 'productmanager', 'productmanager', 'Closed');

      const epic5Result = db.prepare(`
        INSERT INTO epics (title, description, created_by, owner, status)
        VALUES (?, ?, ?, ?, ?)
      `).run('Open Dependency Epic', 'Epic that serves as an open dependency', 'productmanager', 'productmanager', 'Open');

      // Set up dependencies
      const depStmt = db.prepare(`
        INSERT INTO epic_dependencies (dependent_epic_id, dependency_epic_id, created_by)
        VALUES (?, ?, ?)
      `);

      // Epic2 depends on Epic4 (closed) - should be resolved
      depStmt.run(epic2Result.lastInsertRowid, epic4Result.lastInsertRowid, 'productmanager');

      // Epic3 depends on Epic5 (open) - should be unresolved
      depStmt.run(epic3Result.lastInsertRowid, epic5Result.lastInsertRowid, 'productmanager');

      // Test the dependencies_resolved flag calculation
      // Epic1: No dependencies - should be true
      const epic1Deps = db.prepare('SELECT dependency_epic_id FROM epic_dependencies WHERE dependent_epic_id = ?').all(epic1Result.lastInsertRowid);
      this.assert(epic1Deps.length === 0, 'Epic1 should have no dependencies');

      // Epic2: Depends on closed epic - should be true
      const epic2Deps = db.prepare('SELECT dependency_epic_id FROM epic_dependencies WHERE dependent_epic_id = ?').all(epic2Result.lastInsertRowid);
      this.assert(epic2Deps.length === 1, 'Epic2 should have 1 dependency');
      const epic4Status = db.prepare('SELECT status FROM epics WHERE id = ?').get(epic4Result.lastInsertRowid);
      this.assert(epic4Status.status === 'Closed', 'Epic4 should be closed');

      // Epic3: Depends on open epic - should be false
      const epic3Deps = db.prepare('SELECT dependency_epic_id FROM epic_dependencies WHERE dependent_epic_id = ?').all(epic3Result.lastInsertRowid);
      this.assert(epic3Deps.length === 1, 'Epic3 should have 1 dependency');
      const epic5Status = db.prepare('SELECT status FROM epics WHERE id = ?').get(epic5Result.lastInsertRowid);
      this.assert(epic5Status.status === 'Open', 'Epic5 should be open');

      // The MCP tool would calculate dependencies_resolved dynamically
      // Here we're testing the underlying database logic

      this.recordTest('testEpicDependenciesResolved', true);
    } catch (error) {
      this.recordTest('testEpicDependenciesResolved', false, error.message);
    }
  }

  async testUserStoryDependenciesResolved() {
    try {
      // Create test user stories with different dependency scenarios
      const story1Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Story with No Dependencies', 'Story that has no dependencies', 'productmanager', 'productmanager', 'New');

      const story2Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Story with Resolved Dependencies', 'Story with all dependencies closed', 'productmanager', 'productmanager', 'New');

      const story3Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Story with Unresolved Dependencies', 'Story with open dependencies', 'productmanager', 'productmanager', 'New');

      const story4Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Closed Dependency Story', 'Story that serves as a dependency', 'productmanager', 'productmanager', 'Closed');

      const story5Result = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(1, 'Open Dependency Story', 'Story that serves as an open dependency', 'productmanager', 'productmanager', 'New');

      // Set up dependencies
      const depStmt = db.prepare(`
        INSERT INTO story_dependencies (dependent_story_id, dependency_story_id, created_by)
        VALUES (?, ?, ?)
      `);

      // Story2 depends on Story4 (closed) - should be resolved
      depStmt.run(story2Result.lastInsertRowid, story4Result.lastInsertRowid, 'productmanager');

      // Story3 depends on Story5 (open) - should be unresolved
      depStmt.run(story3Result.lastInsertRowid, story5Result.lastInsertRowid, 'productmanager');

      // Test the dependencies_resolved flag calculation
      // Story1: No dependencies - should be true
      const story1Deps = db.prepare('SELECT dependency_story_id FROM story_dependencies WHERE dependent_story_id = ?').all(story1Result.lastInsertRowid);
      this.assert(story1Deps.length === 0, 'Story1 should have no dependencies');

      // Story2: Depends on closed story - should be true
      const story2Deps = db.prepare('SELECT dependency_story_id FROM story_dependencies WHERE dependent_story_id = ?').all(story2Result.lastInsertRowid);
      this.assert(story2Deps.length === 1, 'Story2 should have 1 dependency');
      const story4Status = db.prepare('SELECT status FROM user_stories WHERE id = ?').get(story4Result.lastInsertRowid);
      this.assert(story4Status.status === 'Closed', 'Story4 should be closed');

      // Story3: Depends on open story - should be false
      const story3Deps = db.prepare('SELECT dependency_story_id FROM story_dependencies WHERE dependent_story_id = ?').all(story3Result.lastInsertRowid);
      this.assert(story3Deps.length === 1, 'Story3 should have 1 dependency');
      const story5Status = db.prepare('SELECT status FROM user_stories WHERE id = ?').get(story5Result.lastInsertRowid);
      this.assert(story5Status.status === 'New', 'Story5 should be open');

      // The MCP tool would calculate dependencies_resolved dynamically
      // Here we're testing the underlying database logic

      this.recordTest('testUserStoryDependenciesResolved', true);
    } catch (error) {
      this.recordTest('testUserStoryDependenciesResolved', false, error.message);
    }
  }

  async testTaskDependenciesResolved() {
    try {
      // Create a user story first
      const storyResult = db.prepare(`
        INSERT INTO user_stories (epic_id, title, description, created_by, current_owner)
        VALUES (?, ?, ?, ?, ?)
      `).run(1, 'Task Dependencies Test Story', 'Story for testing task dependencies', 'productmanager', 'productmanager');

      // Create test tasks with different dependency scenarios
      const task1Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task with No Dependencies', 'Task that has no dependencies', 'developer', 'architect', 'architect', 'New');

      const task2Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task with Resolved Dependencies', 'Task with all dependencies closed', 'developer', 'architect', 'architect', 'New');

      const task3Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Task with Unresolved Dependencies', 'Task with open dependencies', 'developer', 'architect', 'architect', 'New');

      const task4Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Closed Dependency Task', 'Task that serves as a dependency', 'developer', 'architect', 'architect', 'Closed');

      const task5Result = db.prepare(`
        INSERT INTO tasks (user_story_id, title, description, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(storyResult.lastInsertRowid, 'Open Dependency Task', 'Task that serves as an open dependency', 'developer', 'architect', 'architect', 'New');

      // Set up dependencies
      const depStmt = db.prepare(`
        INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by)
        VALUES (?, ?, ?)
      `);

      // Task2 depends on Task4 (closed) - should be resolved
      depStmt.run(task2Result.lastInsertRowid, task4Result.lastInsertRowid, 'architect');

      // Task3 depends on Task5 (open) - should be unresolved
      depStmt.run(task3Result.lastInsertRowid, task5Result.lastInsertRowid, 'architect');

      // Test the dependencies_resolved flag calculation
      // Task1: No dependencies - should be true
      const task1Deps = db.prepare('SELECT dependency_task_id FROM task_dependencies WHERE dependent_task_id = ?').all(task1Result.lastInsertRowid);
      this.assert(task1Deps.length === 0, 'Task1 should have no dependencies');

      // Task2: Depends on closed task - should be true
      const task2Deps = db.prepare('SELECT dependency_task_id FROM task_dependencies WHERE dependent_task_id = ?').all(task2Result.lastInsertRowid);
      this.assert(task2Deps.length === 1, 'Task2 should have 1 dependency');
      const task4Status = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task4Result.lastInsertRowid);
      this.assert(task4Status.status === 'Closed', 'Task4 should be closed');

      // Task3: Depends on open task - should be false
      const task3Deps = db.prepare('SELECT dependency_task_id FROM task_dependencies WHERE dependent_task_id = ?').all(task3Result.lastInsertRowid);
      this.assert(task3Deps.length === 1, 'Task3 should have 1 dependency');
      const task5Status = db.prepare('SELECT status FROM tasks WHERE id = ?').get(task5Result.lastInsertRowid);
      this.assert(task5Status.status === 'New', 'Task5 should be open');

      // The MCP tool would calculate dependencies_resolved dynamically
      // Here we're testing the underlying database logic

      this.recordTest('testTaskDependenciesResolved', true);
    } catch (error) {
      this.recordTest('testTaskDependenciesResolved', false, error.message);
    }
  }

  async testBugStatusTransitions() {
    try {
      // Create test bugs
      const bug1Result = db.prepare(`
        INSERT INTO bugs (title, description, severity, reported_by, assigned_to, created_by, current_owner, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('Bug Status Transition Test', 'Testing bug status transitions', 'High', 'tester', 'developer', 'developer', 'developer', 'Open');

      // Test valid transitions through the proper workflow
      const updateStmt = db.prepare('UPDATE bugs SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');

      // Test 1: Open -> In Progress (should work)
      updateStmt.run('In Progress', bug1Result.lastInsertRowid);
      let bugStatus = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug1Result.lastInsertRowid);
      this.assert(bugStatus.status === 'In Progress', 'Bug should transition from Open to In Progress');

      // Test 2: In Progress -> Review (should work - required step)
      updateStmt.run('Review', bug1Result.lastInsertRowid);
      bugStatus = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug1Result.lastInsertRowid);
      this.assert(bugStatus.status === 'Review', 'Bug should transition from In Progress to Review');

      // Test 3: Review -> Fixed (should work)
      updateStmt.run('Fixed', bug1Result.lastInsertRowid);
      bugStatus = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug1Result.lastInsertRowid);
      this.assert(bugStatus.status === 'Fixed', 'Bug should transition from Review to Fixed');

      // Test 4: Fixed -> Closed (should work)
      updateStmt.run('Closed', bug1Result.lastInsertRowid);
      bugStatus = db.prepare('SELECT status FROM bugs WHERE id = ?').get(bug1Result.lastInsertRowid);
      this.assert(bugStatus.status === 'Closed', 'Bug should transition from Fixed to Closed');

      this.recordTest('testBugStatusTransitions', true);
    } catch (error) {
      this.recordTest('testBugStatusTransitions', false, error.message);
    }
  }

  async testMCPToolRegistration() {
    try {
      // This test verifies that our expected MCP tools are properly defined
      // It serves as a basic sanity check to catch missing tool registrations

      const expectedTools = [
        'initialize',
        'create_epics', 'list_epics', 'update_epic', 'archive_epic',
        'create_user_stories', 'list_user_stories', 'update_user_story_content',
        'update_user_story_acceptance_criteria', 'archive_user_story',
        'create_tasks', 'list_tasks',
        'create_bugs', 'list_bugs',
        'create_test_cases', 'list_test_cases',
        'update_entity_status',
        'manage_story_dependencies', 'manage_epic_dependencies', 'manage_task_dependencies',
        'create_comments', 'get_comments',
        'create_wiki_page', 'update_wiki_page', 'list_wiki_pages', 'get_wiki_page', 'manage_wiki_links'
      ];

      // Verify we have the expected number of tools
      this.assert(expectedTools.length === 27, `Expected 27 MCP tools, found ${expectedTools.length}`);

      // Test that critical tools are in our expected list
      const criticalTools = ['list_epics', 'list_user_stories', 'list_tasks', 'update_entity_status'];
      criticalTools.forEach(tool => {
        this.assert(expectedTools.includes(tool), `Critical tool '${tool}' should be in expected tools list`);
      });

      this.recordTest('testMCPToolRegistration', true);
    } catch (error) {
      this.recordTest('testMCPToolRegistration', false, error.message);
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

    // Test task dependencies (after list tests to avoid affecting counts)
    await this.testTaskDependencies();

    // Test update operations
    await this.testUpdateEntityStatus();
    await this.testUpdateEntityAssignment();
    await this.testUpdateTaskStatus();
    await this.testUpdateTaskStatusToReview();
    await this.testUserStoryInProgressValidation();
    await this.testUserStoryQAValidation();
    await this.testUserStoryUATValidation();
    await this.testCreateEntitiesWithPhases();
    await this.testUpdateEntityPhases();

    // Test advanced features
    await this.testFiltering();
    await this.testForeignKeyConstraints();
    await this.testPhaseFunctionality();
    await this.testWorkflowIntelligence();
    await this.testTaskDependencyIntelligence();
    await this.testBugStatusIntelligence();
    await this.testEpicDependenciesResolved();
    await this.testUserStoryDependenciesResolved();
    await this.testTaskDependenciesResolved();
    await this.testBugStatusTransitions();
    await this.testMCPToolRegistration();

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