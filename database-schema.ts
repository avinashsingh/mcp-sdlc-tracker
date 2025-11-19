import Database from 'better-sqlite3';

// Database schema creation function
export function createDatabaseSchema(database: Database): void {
  database.exec(`
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
       closed_at DATETIME,
       archived BOOLEAN DEFAULT FALSE,
       archived_at DATETIME,
       archived_by TEXT,
       archive_reason TEXT
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
       archived BOOLEAN DEFAULT FALSE,
       archived_at DATETIME,
       archived_by TEXT,
       archive_reason TEXT,
       FOREIGN KEY (epic_id) REFERENCES epics(id) ON DELETE CASCADE
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
      estimated_hours INTEGER,
      actual_hours INTEGER,
      phase TEXT,
      phase_status TEXT DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
      FOREIGN KEY (user_story_id) REFERENCES user_stories(id) ON DELETE CASCADE
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
      FOREIGN KEY (user_story_id) REFERENCES user_stories(id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
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
      created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      current_owner TEXT NOT NULL DEFAULT 'tester' CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      assigned_to TEXT CHECK (assigned_to IN ('tester', 'productmanager')),
      phase TEXT,
      phase_status TEXT DEFAULT 'New',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_run_at DATETIME,
      last_run_by TEXT CHECK (last_run_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      FOREIGN KEY (user_story_id) REFERENCES user_stories(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
      entity_id INTEGER NOT NULL,
      comment_text TEXT NOT NULL,
      author TEXT NOT NULL CHECK (author IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_story_content_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL CHECK (changed_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_story_acceptance_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id INTEGER NOT NULL,
      old_acceptance_criteria TEXT,
      new_acceptance_criteria TEXT,
      changed_by TEXT NOT NULL CHECK (changed_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (story_id) REFERENCES user_stories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entity_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
      entity_id INTEGER NOT NULL,
      field_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by TEXT NOT NULL CHECK (changed_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Wiki System Tables
    CREATE TABLE IF NOT EXISTS wiki_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      category TEXT CHECK (category IN ('technical', 'process', 'business', 'qa', 'knowledge')),
      is_template BOOLEAN DEFAULT FALSE,
      template_name TEXT,
      created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      current_owner TEXT NOT NULL CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      assigned_to TEXT CHECK (assigned_to IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
      status TEXT NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Published', 'Archived')),
      version INTEGER DEFAULT 1,
      parent_page_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      published_at DATETIME,
      archived_at DATETIME,
      archived_by TEXT,
      FOREIGN KEY (parent_page_id) REFERENCES wiki_pages(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS wiki_page_revisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      tags TEXT,
      changed_by TEXT NOT NULL,
      change_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wiki_page_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wiki_page_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
      entity_id INTEGER NOT NULL,
      link_type TEXT DEFAULT 'related' CHECK (link_type IN ('related', 'documentation', 'requirements', 'design', 'testing')),
      created_by TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wiki_page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
    );

    -- Transition audit tables for tracking status and ownership changes
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

    -- Create indexes for better performance
    -- Core entity indexes
    CREATE INDEX IF NOT EXISTS idx_epics_status ON epics(status);
    CREATE INDEX IF NOT EXISTS idx_user_stories_epic_id ON user_stories(epic_id);
    CREATE INDEX IF NOT EXISTS idx_user_stories_status ON user_stories(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_user_story_id ON tasks(user_story_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_bugs_user_story_id ON bugs(user_story_id);
    CREATE INDEX IF NOT EXISTS idx_bugs_task_id ON bugs(task_id);
    CREATE INDEX IF NOT EXISTS idx_bugs_status ON bugs(status);
    CREATE INDEX IF NOT EXISTS idx_test_cases_user_story_id ON test_cases(user_story_id);
    CREATE INDEX IF NOT EXISTS idx_test_cases_status ON test_cases(status);
    CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);

    -- Transition audit indexes
    CREATE INDEX IF NOT EXISTS idx_ownership_transitions_entity ON ownership_transitions(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_status_transitions_entity ON status_transitions(entity_type, entity_id);

    -- Phase tracking indexes
    CREATE INDEX IF NOT EXISTS idx_user_stories_phase ON user_stories(phase);
    CREATE INDEX IF NOT EXISTS idx_user_stories_phase_status ON user_stories(phase_status);
    CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase);
    CREATE INDEX IF NOT EXISTS idx_tasks_phase_status ON tasks(phase_status);
    CREATE INDEX IF NOT EXISTS idx_bugs_phase ON bugs(phase);
    CREATE INDEX IF NOT EXISTS idx_bugs_phase_status ON bugs(phase_status);
    CREATE INDEX IF NOT EXISTS idx_test_cases_phase ON test_cases(phase);
    CREATE INDEX IF NOT EXISTS idx_test_cases_phase_status ON test_cases(phase_status);

    -- Dependency indexes
    CREATE INDEX IF NOT EXISTS idx_story_dependencies_dependent ON story_dependencies(dependent_story_id);
    CREATE INDEX IF NOT EXISTS idx_story_dependencies_dependency ON story_dependencies(dependency_story_id);
    CREATE INDEX IF NOT EXISTS idx_epic_dependencies_dependent ON epic_dependencies(dependent_epic_id);
    CREATE INDEX IF NOT EXISTS idx_epic_dependencies_dependency ON epic_dependencies(dependency_epic_id);

    -- Wiki indexes
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_slug ON wiki_pages(slug);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_category ON wiki_pages(category);
    CREATE INDEX IF NOT EXISTS idx_wiki_pages_status ON wiki_pages(status);
    CREATE INDEX IF NOT EXISTS idx_wiki_page_links_entity ON wiki_page_links(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_page_revisions_page ON wiki_page_revisions(page_id, version);
  `);
}

export function initializeDatabase(dbPath: string): Database {
  const db = new Database(dbPath);
  createDatabaseSchema(db);
  return db;
}

// Schema constants for validation and testing
export const SCHEMA_VERSION = '1.0.0';
export const REQUIRED_TABLES = [
  'epics',
  'user_stories',
  'tasks',
  'bugs',
  'test_cases',
  'story_dependencies',
  'epic_dependencies',
  'comments',
  'user_story_content_changes',
  'user_story_acceptance_changes',
  'entity_changes',
  'wiki_pages',
  'wiki_page_revisions',
  'wiki_page_links',
  'status_transitions',
  'ownership_transitions'
];