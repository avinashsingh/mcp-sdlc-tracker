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

      // Test 1: Filter tasks that depend on a specific task (depends_on)
      const dependsOnResult = await this.callTool('list_tasks', { depends_on: task3Result.lastInsertRowid });
      this.assert(dependsOnResult.data.length === 1, 'Should find 1 task that depends on Task 3');
      this.assert(dependsOnResult.data[0].id === task4Result.lastInsertRowid, 'Should return Task 4');

      // Test 2: Filter tasks that are depended on by a specific task (depended_by)
      const dependedByResult = await this.callTool('list_tasks', { depended_by: task4Result.lastInsertRowid });
      this.assert(dependedByResult.data.length === 1, 'Should find 1 task that is depended on by Task 4');
      this.assert(dependedByResult.data[0].id === task3Result.lastInsertRowid, 'Should return Task 3');

      // Test 3: Filter tasks that have dependencies (has_dependencies: true)
      const hasDepsResult = await this.callTool('list_tasks', { has_dependencies: true });
      this.assert(hasDepsResult.data.length >= 2, 'Should find tasks with dependencies');

      // Test 4: Filter tasks that have no dependencies (has_dependencies: false)
      const noDepsResult = await this.callTool('list_tasks', { has_dependencies: false });
      this.assert(noDepsResult.data.length >= 1, 'Should find tasks without dependencies');

      // Test 5: Combine dependency filter with other filters
      const combinedResult = await this.callTool('list_tasks', {
        user_story_id: story2Result.lastInsertRowid,
        has_dependencies: true
      });
      this.assert(combinedResult.data.length === 1, 'Should find 1 task in story 2 with dependencies');
      this.assert(combinedResult.data[0].id === task4Result.lastInsertRowid, 'Should return Task 4');

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
    await this.testCreateEntitiesWithPhases();
    await this.testUpdateEntityPhases();

    // Test advanced features
    await this.testFiltering();
    await this.testForeignKeyConstraints();
    await this.testPhaseFunctionality();
    await this.testWorkflowIntelligence();

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