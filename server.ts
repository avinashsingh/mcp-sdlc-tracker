import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { existsSync, statSync } from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced Universal Filters Interface
interface UniversalFilters {
  // ... existing filters ...
  phase?: string | string[];           // Filter by current phase
  phase_status?: string | string[];     // Filter by phase completion status
  // ... other existing filters
}

// Enhanced List Response Format
interface ListResponse<T> {
  data: T[];
  total_count: number;
  filtered_count: number;
  phase_context?: {                       // NEW: Phase context in responses
    current_phase: string;
    phase_status: string;
    active_stakeholders: string[];
  };
  applied_filters: { [key: string]: any };
  pagination?: { limit: number; offset: number; has_more: boolean };
}

// Database initialization state
let db: Database | null = null;
let dbPath: string | null = null;
let isInitialized = false;

// HTTP Server state
let httpPort: number | null = null;
let browserOpened = false;

function getDatabase(): Database {
  if (!isInitialized || !db) {
    throw new Error(`Database not initialized. Please run 'initialize' command first with project directory path.`);
  }
  return db;
}

// Helper function to validate foreign key references
function validateForeignKeys(database: Database, type: 'epic' | 'user_story' | 'task', ids: (number | null)[]): { valid: boolean; invalidIds: number[] } {
  if (ids.every(id => id === null)) {
    return { valid: true, invalidIds: [] };
  }

  const nonNullIds = ids.filter(id => id !== null) as number[];
  if (nonNullIds.length === 0) {
    return { valid: true, invalidIds: [] };
  }

  const tableName = type === 'epic' ? 'epics' : type === 'user_story' ? 'user_stories' : 'tasks';
  const placeholders = nonNullIds.map(() => '?').join(',');
  const stmt = database.prepare(`SELECT id FROM ${tableName} WHERE id IN (${placeholders})`);
  const existing = stmt.all(...nonNullIds) as { id: number }[];
  const existingIds = existing.map(row => row.id);
  const invalidIds = nonNullIds.filter(id => !existingIds.includes(id));

  return { valid: invalidIds.length === 0, invalidIds };
}

// HTTP API Routes
app.get('/api/status', (req, res) => {
  res.json({
    initialized: isInitialized,
    databasePath: dbPath,
    serverPort: httpPort
  });
});

app.get('/api/epics', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const database = getDatabase();
    const epics = database.prepare(`
      SELECT e.*, COUNT(us.id) as user_story_count
      FROM epics e
      LEFT JOIN user_stories us ON e.id = us.epic_id
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `).all();

    // Get user stories for each epic
    for (const epic of epics) {
      epic.userStories = database.prepare(`
        SELECT us.*,
               COUNT(t.id) as task_count,
               COUNT(b.id) as bug_count,
               COUNT(tc.id) as test_case_count
        FROM user_stories us
        LEFT JOIN tasks t ON us.id = t.user_story_id
        LEFT JOIN bugs b ON us.id = b.user_story_id
        LEFT JOIN test_cases tc ON us.id = tc.user_story_id
        WHERE us.epic_id = ?
        GROUP BY us.id
        ORDER BY us.created_at DESC
      `).all(epic.id);

      // Get comment count for epic
      epic.comment_count = database.prepare(`
        SELECT COUNT(*) as count FROM comments WHERE entity_type = 'epic' AND entity_id = ?
      `).get(epic.id).count;

      // Get tasks, bugs, and test cases for each user story
      for (const userStory of epic.userStories) {
        userStory.tasks = database.prepare(`
          SELECT * FROM tasks WHERE user_story_id = ? ORDER BY created_at DESC
        `).all(userStory.id);

        userStory.bugs = database.prepare(`
          SELECT * FROM bugs WHERE user_story_id = ? ORDER BY created_at DESC
        `).all(userStory.id);

        userStory.testCases = database.prepare(`
          SELECT * FROM test_cases WHERE user_story_id = ? ORDER BY created_at DESC
        `).all(userStory.id);

        // Get comment count for user story
        userStory.comment_count = database.prepare(`
          SELECT COUNT(*) as count FROM comments WHERE entity_type = 'user_story' AND entity_id = ?
        `).get(userStory.id).count;

        // Get comment counts for tasks, bugs, and test cases
        userStory.tasks.forEach(task => {
          task.comment_count = database.prepare(`
            SELECT COUNT(*) as count FROM comments WHERE entity_type = 'task' AND entity_id = ?
          `).get(task.id).count;
        });

        userStory.bugs.forEach(bug => {
          bug.comment_count = database.prepare(`
            SELECT COUNT(*) as count FROM comments WHERE entity_type = 'bug' AND entity_id = ?
          `).get(bug.id).count;
        });

        userStory.testCases.forEach(testCase => {
          testCase.comment_count = database.prepare(`
            SELECT COUNT(*) as count FROM comments WHERE entity_type = 'test_case' AND entity_id = ?
          `).get(testCase.id).count;
        });
      }
    }

    res.json(epics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Main dashboard route
app.get('/', (req, res) => {
  if (!isInitialized) {
    return res.redirect('/init');
  }

  res.render('dashboard', {
    title: 'SDLC Tracker Dashboard'
  });
});

// Initialization pending page
app.get('/init', (req, res) => {
  res.render('init', {
    title: 'SDLC Tracker - Initialization Required'
  });
});

// Manual browser opening endpoint
app.get('/open-browser', async (req, res) => {
  const url = `http://localhost:${httpPort}`;
  try {
    await open(url);
    res.json({ success: true, message: 'Browser opened successfully' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Get comments for an entity
app.get('/api/comments/:entityType/:entityId', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { entityType, entityId } = req.params;
    const database = getDatabase();

    const comments = database.prepare(`
      SELECT c.*, u.created_by as author_name
      FROM comments c
      LEFT JOIN ${entityType}s u ON c.entity_id = u.id
      WHERE c.entity_type = ? AND c.entity_id = ?
      ORDER BY c.created_at DESC
      LIMIT 10
    `).all(entityType, parseInt(entityId));

    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Function to attempt browser opening
async function tryOpenBrowser(url: string) {
  if (!isInitialized) {
    console.error('⏳ Database not initialized - serving init page');
    console.error(`   Initialize database first, then visit: ${url}`);
    return;
  }

  if (browserOpened) {
    console.error('📱 Browser already opened');
    return;
  }

  console.error('📊 Dashboard ready - opening browser...');
  try {
    // Add timeout to prevent hanging
    const openPromise = open(url);
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Browser open timeout')), 5000)
    );

    await Promise.race([openPromise, timeoutPromise]);
    browserOpened = true;
    console.error('🚀 Browser opened automatically');
  } catch (error) {
    console.error('⚠️  Browser auto-open failed:');
    console.error(`   Error: ${error.message}`);
    console.error(`   Platform: ${process.platform}`);
    console.error(`   URL: ${url}`);
    console.error('   Please manually open the URL above');
  }
}

// Create MCP server
const server = new McpServer({
  name: 'sqlite-tracker-server',
  version: '1.0.0'
});

// SDLC Entity Management Tools

// Tool: Initialize Database
server.registerTool(
  'initialize',
  {
    title: 'Initialize Database',
    description: 'Initialize the SDLC tracker database in the specified project directory. You must provide your current working directory path (e.g., "/Users/username/project").',
    inputSchema: {
      path: z.string().min(1, "Path is required. Provide your current working directory path.")
    },
    outputSchema: {
      success: z.boolean(),
      message: z.string(),
      database_path: z.string()
    }
  },
  async ({ path }) => {
    try {
      // Validate the path
      if (!existsSync(path)) {
        throw new Error(`Path does not exist: ${path}`);
      }
      const stat = statSync(path);
      if (!stat.isDirectory()) {
        throw new Error(`Path is not a directory: ${path}`);
      }
      // Basic security check: prevent path traversal
      if (path.includes('..') || path.includes('\0')) {
        throw new Error(`Invalid path: ${path}`);
      }

      const projectDir = path;
      const dbFilePath = `${projectDir}/.project_tracker.db`;

      // Check if already initialized
      if (isInitialized) {
        return {
          content: [{ type: 'text', text: 'Database already initialized' }],
          structuredContent: {
            success: false,
            message: 'Database already initialized',
            database_path: dbPath!
          }
        };
      }

      // Initialize database
      db = new Database(dbFilePath);
      dbPath = dbFilePath;

      // Execute all CREATE TABLE statements
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

        -- Supporting Tables for Audit Trail
        CREATE TABLE IF NOT EXISTS ownership_transitions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK (entity_type IN ('epic', 'user_story', 'task', 'bug', 'test_case')),
          entity_id INTEGER NOT NULL,
          from_owner TEXT CHECK (from_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
          to_owner TEXT NOT NULL CHECK (to_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
          transitioned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          transitioned_by TEXT NOT NULL CHECK (transitioned_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect'))
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
      `);

      // Create indexes for performance
      db.exec(`
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
      `);

      isInitialized = true;

      // Try to open browser now that database is initialized
      if (httpPort) {
        const url = `http://localhost:${httpPort}`;
        setTimeout(() => tryOpenBrowser(url), 100); // Small delay to ensure server is ready
      }

      return {
        content: [{ type: 'text', text: 'Database initialized successfully' }],
        structuredContent: {
          success: true,
          message: 'Database initialized successfully',
          database_path: dbFilePath
        }
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to initialize database: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create Epics
server.registerTool(
  'create_epics',
  {
    title: 'Create Epics',
    description: 'Create multiple epics in the SDLC tracker',
    inputSchema: {
      epics: z.array(z.object({
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        assigned_to: z.literal('productmanager').optional()
      })).min(1, 'At least one epic is required')
    },
    outputSchema: {
      epics_created: z.array(z.object({
        epic_id: z.number(),
        title: z.string(),
        success: z.boolean()
      })),
      total_created: z.number()
    }
  },
  async ({ epics }) => {
    console.error('create_epics called with:', JSON.stringify(epics, null, 2));
    try {
      const database = getDatabase();
      const stmt = database.prepare(`
        INSERT INTO epics (title, description, assigned_to)
        VALUES (?, ?, ?)
      `);

      const results: { epic_id: number | null; title: string; success: boolean; error?: string }[] = [];
      for (const epic of epics) {
        try {
          const result = stmt.run(epic.title, epic.description || null, epic.assigned_to || 'productmanager');
          results.push({
            epic_id: result.lastInsertRowid as number,
            title: epic.title,
            success: true
          });
        } catch (error) {
          results.push({
            epic_id: null,
            title: epic.title,
            success: false,
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.success);
      const output = {
        epics_created: results,
        total_created: successful.length
      };

      console.error('create_epics returning:', JSON.stringify(output, null, 2));
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      console.error('create_epics error:', error.message);
      return {
        content: [{ type: 'text', text: `Error creating epics: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create User Stories
server.registerTool(
  'create_user_stories',
  {
    title: 'Create User Stories',
    description: 'Create multiple user stories in the SDLC tracker',
    inputSchema: {
      user_stories: z.array(z.object({
        epic_id: z.number(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        acceptance_criteria: z.string().optional(),
        story_points: z.number().optional(),
        assigned_to: z.string().optional(),
        phase: z.string().optional(),
        phase_status: z.string().optional()
      })).min(1, 'At least one user story is required')
    },
    outputSchema: {
      user_stories_created: z.array(z.object({
        user_story_id: z.number().nullable(),
        title: z.string(),
        success: z.boolean(),
        error: z.string().optional()
      })),
      total_created: z.number()
    }
  },
  async ({ user_stories }) => {
    try {
      const database = getDatabase();

      // Validate epic references
      const epicIds = user_stories.map(us => us.epic_id).filter(id => id !== undefined);
      const epicValidation = validateForeignKeys(database, 'epic', epicIds);
      if (!epicValidation.valid) {
        return {
          content: [{ type: 'text', text: `Invalid epic IDs: ${epicValidation.invalidIds.join(', ')}` }],
          isError: true
        };
      }

      const stmt = database.prepare(`
        INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, story_points, assigned_to, phase, phase_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const results: { user_story_id: number | null; title: string; success: boolean; error?: string }[] = [];
      for (const userStory of user_stories) {
        try {
          const result = stmt.run(
            userStory.epic_id || null,
            userStory.title,
            userStory.description || null,
            userStory.acceptance_criteria || null,
            userStory.story_points || null,
            userStory.assigned_to || null,
            userStory.phase || null,
            userStory.phase_status || null,
            'productmanager'
          );
          results.push({
            user_story_id: result.lastInsertRowid as number,
            title: userStory.title,
            success: true
          });
        } catch (error) {
          results.push({
            user_story_id: null,
            title: userStory.title,
            success: false,
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.success);
      const output = {
        user_stories_created: results,
        total_created: successful.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error creating user stories: ${error.message}` }],
        isError: true
      };
    }
  }
);
 
// Tool: Create Tasks
server.registerTool(
  'create_tasks',
  {
    title: 'Create Tasks',
    description: 'Create multiple tasks in the SDLC tracker',
    inputSchema: {
      tasks: z.array(z.object({
        user_story_id: z.number(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        assigned_to: z.enum(['architect', 'developer']).optional(),
        estimated_hours: z.number().optional(),
        phase: z.string().optional(),
        phase_status: z.string().optional()
       })).min(1, 'At least one task is required')
     },
      outputSchema: {
        tasks_created: z.array(z.object({
          task_id: z.number().nullable(),
          title: z.string(),
          success: z.boolean(),
          error: z.string().optional()
        })),
        total_created: z.number()
      }
  },
   async ({ tasks }) => {
     try {
       const database = getDatabase();

       // Validate user story references
       const userStoryIds = tasks.map(t => t.user_story_id).filter(id => id !== undefined);
       const userStoryValidation = validateForeignKeys(database, 'user_story', userStoryIds);
       if (!userStoryValidation.valid) {
         return {
           content: [{ type: 'text', text: `Invalid user story IDs: ${userStoryValidation.invalidIds.join(', ')}` }],
           isError: true
         };
       }

       const stmt = database.prepare(`
          INSERT INTO tasks (user_story_id, title, description, assigned_to, estimated_hours, phase, phase_status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

       const results: { task_id: number | null; title: string; success: boolean; error?: string }[] = [];
       for (const task of tasks) {
         try {
            const result = stmt.run(
              task.user_story_id || null,
              task.title,
              task.description || null,
              task.assigned_to || 'architect',
              task.estimated_hours || null,
              task.phase || null,
              task.phase_status || null,
              'architect'
            );
           results.push({
             task_id: result.lastInsertRowid as number,
             title: task.title,
             success: true
           });
         } catch (error) {
           results.push({
             task_id: null,
             title: task.title,
             success: false,
             error: error.message
           });
         }
       }

      const successful = results.filter(r => r.success);
       const output = {
         tasks_created: results,
         total_created: successful.length
       };

       return {
         content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
         structuredContent: output
       };
     } catch (error) {
       return {
         content: [{ type: 'text', text: `Error creating tasks: ${error.message}` }],
         isError: true
       };
    }
   }
 );

// Tool: Create Bugs
server.registerTool(
  'create_bugs',
  {
    title: 'Create Bugs',
    description: 'Create multiple bug reports with severity levels, reporter, and assignee information',
    inputSchema: {
      bugs: z.array(z.object({
        user_story_id: z.number().optional(),
        task_id: z.number().optional(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
        reported_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']),
        assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
        phase: z.string().optional(),
        phase_status: z.string().optional()
      })).min(1, 'At least one bug is required')
    },
    outputSchema: {
      bugs_created: z.array(z.object({
        bug_id: z.number().nullable(),
        title: z.string(),
        success: z.boolean(),
        error: z.string().optional()
      })),
      total_created: z.number()
    }
  },
  async ({ bugs }) => {
    try {
      const database = getDatabase();

      // Validate user story and task references
      const userStoryIds = bugs.map(b => b.user_story_id).filter(id => id !== undefined);
      const taskIds = bugs.map(b => b.task_id).filter(id => id !== undefined);

      const userStoryValidation = validateForeignKeys(database, 'user_story', userStoryIds);
      const taskValidation = validateForeignKeys(database, 'task', taskIds);

      const invalidIds: string[] = [];
      if (!userStoryValidation.valid) {
        invalidIds.push(`user stories: ${userStoryValidation.invalidIds.join(', ')}`);
      }
      if (!taskValidation.valid) {
        invalidIds.push(`tasks: ${taskValidation.invalidIds.join(', ')}`);
      }

      if (invalidIds.length > 0) {
        return {
          content: [{ type: 'text', text: `Invalid foreign key references: ${invalidIds.join('; ')}` }],
          isError: true
        };
      }

      const stmt = database.prepare(`
        INSERT INTO bugs (user_story_id, task_id, title, description, severity, reported_by, assigned_to, phase, phase_status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const results: { bug_id: number | null; title: string; success: boolean; error?: string }[] = [];
      for (const bug of bugs) {
        try {
          const result = stmt.run(
            bug.user_story_id || null,
            bug.task_id || null,
            bug.title,
            bug.description || null,
            bug.severity,
            bug.reported_by,
            bug.assigned_to || null,
            bug.phase || null,
            bug.phase_status || null,
            'tester'
          );
          results.push({
            bug_id: result.lastInsertRowid as number,
            title: bug.title,
            success: true
          });
        } catch (error) {
          results.push({
            bug_id: null,
            title: bug.title,
            success: false,
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.success);
      const output = {
        bugs_created: results,
        total_created: successful.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error creating bugs: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create Test Cases
server.registerTool(
  'create_test_cases',
  {
    title: 'Create Test Cases',
    description: 'Create multiple test cases in the SDLC tracker',
    inputSchema: {
      test_cases: z.array(z.object({
        user_story_id: z.number().optional(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        preconditions: z.string().optional(),
        steps: z.string().min(1, 'Steps are required'),
        expected_result: z.string().min(1, 'Expected result is required'),
        assigned_to: z.enum(['tester', 'productmanager']).optional(),
        phase: z.string().optional(),
        phase_status: z.string().optional()
      })).min(1, 'At least one test case is required')
    },
    outputSchema: {
      test_cases_created: z.array(z.object({
        test_case_id: z.number().nullable(),
        title: z.string(),
        success: z.boolean(),
        error: z.string().optional()
      })),
      total_created: z.number()
    }
  },
  async ({ test_cases }) => {
    try {
      const database = getDatabase();

      // Validate user story references
      const userStoryIds = test_cases.map(tc => tc.user_story_id).filter(id => id !== undefined);
      const userStoryValidation = validateForeignKeys(database, 'user_story', userStoryIds);
      if (!userStoryValidation.valid) {
        return {
          content: [{ type: 'text', text: `Invalid user story IDs: ${userStoryValidation.invalidIds.join(', ')}` }],
          isError: true
        };
      }

      const stmt = database.prepare(`
        INSERT INTO test_cases (user_story_id, title, description, preconditions, steps, expected_result, assigned_to, phase, phase_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const results: { test_case_id: number | null; title: string; success: boolean; error?: string }[] = [];
      for (const testCase of test_cases) {
        try {
          const result = stmt.run(
            testCase.user_story_id || null,
            testCase.title,
            testCase.description || null,
            testCase.preconditions || null,
            testCase.steps,
            testCase.expected_result,
            testCase.assigned_to || 'tester',
            testCase.phase || null,
            testCase.phase_status || null
          );
          results.push({
            test_case_id: result.lastInsertRowid as number,
            title: testCase.title,
            success: true
          });
        } catch (error) {
          results.push({
            test_case_id: null,
            title: testCase.title,
            success: false,
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.success);
      const output = {
        test_cases_created: results,
        total_created: successful.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error creating test cases: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Create Comments
server.registerTool(
  'create_comments',
  {
    title: 'Create Comments',
    description: 'Create multiple comments on SDLC entities for stakeholder feedback',
    inputSchema: {
      comments: z.array(z.object({
        entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
        entity_id: z.number(),
        comment_text: z.string().min(1, 'Comment text is required'),
        author: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect'])
      })).min(1, 'At least one comment is required')
    },
    outputSchema: {
      comments_created: z.array(z.object({
        comment_id: z.number().optional(),
        entity_type: z.string(),
        entity_id: z.number(),
        success: z.boolean(),
        error: z.string().optional()
      })),
      total_created: z.number()
    }
  },
  async ({ comments }) => {
    try {
      const database = getDatabase();
      const stmt = database.prepare(`
        INSERT INTO comments (entity_type, entity_id, comment_text, author)
        VALUES (?, ?, ?, ?)
      `);

      const results: { comment_id?: number; entity_type: string; entity_id: number; success: boolean; error?: string }[] = [];
      for (const comment of comments) {
        try {
          // Check if entity exists
          const tableName = {
            epic: 'epics',
            user_story: 'user_stories',
            task: 'tasks',
            bug: 'bugs',
            test_case: 'test_cases'
          }[comment.entity_type];
          const entityCheck = database.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(comment.entity_id);
          if (!entityCheck) {
            results.push({
              comment_id: undefined,
              entity_type: comment.entity_type,
              entity_id: comment.entity_id,
              success: false,
              error: `${comment.entity_type} with id ${comment.entity_id} not found`
            });
            continue;
          }

          const result = stmt.run(comment.entity_type, comment.entity_id, comment.comment_text, comment.author);
          results.push({
            comment_id: result.lastInsertRowid as number,
            entity_type: comment.entity_type,
            entity_id: comment.entity_id,
            success: true
          });
        } catch (error) {
          results.push({
            entity_type: comment.entity_type,
            entity_id: comment.entity_id,
            success: false,
            error: error.message
          });
        }
      }

      const successful = results.filter(r => r.success);
      const output = {
        comments_created: results,
        total_created: successful.length
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error creating comments: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List Epics
server.registerTool(
  'list_epics',
  {
    title: 'List Epics',
    description: 'List epics with optional filtering',
    inputSchema: {
      status: z.enum(['New', 'Open', 'Closed']).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
      data: z.array(z.object({
        id: z.number(),
        title: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        owner: z.string(),
        assigned_to: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string()
      })),
      total_count: z.number(),
      filtered_count: z.number(),
      phase_context: z.object({
        current_phase: z.string(),
        phase_status: z.string(),
        active_stakeholders: z.array(z.string())
      }),
      applied_filters: z.record(z.any()),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        has_more: z.boolean()
      })
    }
  },
   async ({ status, limit = 50 }) => {
     try {
       const database = getDatabase();
       let query = 'SELECT * FROM epics WHERE 1=1';
       const params: any[] = [];
       const applied_filters: { [key: string]: any } = {};

       if (status) {
         query += ' AND status = ?';
         params.push(status);
         applied_filters.status = status;
       }

       query += ' ORDER BY created_at DESC LIMIT ?';
       params.push(limit);

       const stmt = database.prepare(query);
       const epics = stmt.all(...params);

       const output = {
         data: epics,
         total_count: epics.length,
         filtered_count: epics.length,
         phase_context: {
           current_phase: "Not Set",
           phase_status: "New",
           active_stakeholders: ["productmanager"]
         },
         applied_filters,
         pagination: {
           limit,
           offset: 0,
           has_more: false
         }
       };

       return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing epics: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List User Stories
server.registerTool(
  'list_user_stories',
  {
    title: 'List User Stories',
    description: 'List user stories with optional filtering',
    inputSchema: {
      epic_id: z.number().optional(),
      status: z.enum(['New', 'In Progress', 'QA', 'UAT', 'Closed']).optional(),
      assigned_to: z.enum(['productmanager', 'architect', 'developer', 'tester']).optional(),
      phase: z.union([z.string(), z.array(z.string())]).optional(),
      phase_status: z.union([z.string(), z.array(z.string())]).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
      data: z.array(z.object({
        id: z.number(),
        epic_id: z.number().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        acceptance_criteria: z.string().nullable(),
        status: z.string(),
        current_owner: z.string(),
        assigned_to: z.string().nullable(),
        story_points: z.number().nullable(),
        phase: z.string().nullable(),
        phase_status: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string()
      })),
      total_count: z.number(),
      filtered_count: z.number(),
      phase_context: z.object({
        current_phase: z.string(),
        phase_status: z.string(),
        active_stakeholders: z.array(z.string())
      }).optional(),
      applied_filters: z.record(z.any()),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        has_more: z.boolean()
      }).optional()
    }
  },
  async ({ epic_id, status, assigned_to, phase, phase_status, limit = 50 }) => {
    try {
      const database = getDatabase();
      let query = 'SELECT * FROM user_stories WHERE 1=1';
      const params: any[] = [];

      if (epic_id) {
        query += ' AND epic_id = ?';
        params.push(epic_id);
      }

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (assigned_to) {
        query += ' AND assigned_to = ?';
        params.push(assigned_to);
      }

      if (phase) {
        if (Array.isArray(phase)) {
          query += ` AND phase IN (${phase.map(() => '?').join(',')})`;
          params.push(...phase);
        } else {
          query += ' AND phase = ?';
          params.push(phase);
        }
      }

      if (phase_status) {
        if (Array.isArray(phase_status)) {
          query += ` AND phase_status IN (${phase_status.map(() => '?').join(',')})`;
          params.push(...phase_status);
        } else {
          query += ' AND phase_status = ?';
          params.push(phase_status);
        }
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = database.prepare(query);
      const user_stories = stmt.all(...params);

      // Calculate phase context
      const phaseContext = user_stories.length > 0 ? {
        current_phase: user_stories[0].phase || 'Not Set',
        phase_status: user_stories[0].phase_status || 'New',
        active_stakeholders: ['productmanager', 'architect', 'developer', 'tester']
      } : undefined;

      const appliedFilters: { [key: string]: any } = {};
      if (epic_id) appliedFilters.epic_id = epic_id;
      if (status) appliedFilters.status = status;
      if (assigned_to) appliedFilters.assigned_to = assigned_to;
      if (phase) appliedFilters.phase = phase;
      if (phase_status) appliedFilters.phase_status = phase_status;

      const output = {
        data: user_stories,
        total_count: user_stories.length,
        filtered_count: user_stories.length,
        phase_context: phaseContext,
        applied_filters: appliedFilters,
        pagination: { limit, offset: 0, has_more: false }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing user stories: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List Bugs
server.registerTool(
  'list_bugs',
  {
    title: 'List Bugs',
    description: 'List bugs with optional filtering',
    inputSchema: {
      status: z.enum(['Open', 'In Progress', 'Fixed', 'Closed']).optional(),
      severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
      reported_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
      assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
      phase: z.union([z.string(), z.array(z.string())]).optional(),
      phase_status: z.union([z.string(), z.array(z.string())]).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
      data: z.array(z.object({
        id: z.number(),
        user_story_id: z.number().nullable(),
        task_id: z.number().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        severity: z.string(),
        reported_by: z.string(),
        assigned_to: z.string().nullable(),
        phase: z.string().nullable(),
        phase_status: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string()
      })),
      total_count: z.number(),
      filtered_count: z.number(),
      phase_context: z.object({
        current_phase: z.string(),
        phase_status: z.string(),
        active_stakeholders: z.array(z.string())
      }).optional(),
      applied_filters: z.record(z.any()),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        has_more: z.boolean()
      }).optional()
    }
  },
  async ({ status, severity, reported_by, assigned_to, phase, phase_status, limit = 50 }) => {
    try {
      const database = getDatabase();
      let query = 'SELECT * FROM bugs WHERE 1=1';
      const params: any[] = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (severity) {
        query += ' AND severity = ?';
        params.push(severity);
      }

      if (reported_by) {
        query += ' AND reported_by = ?';
        params.push(reported_by);
      }

      if (assigned_to) {
        query += ' AND assigned_to = ?';
        params.push(assigned_to);
      }

      if (phase) {
        if (Array.isArray(phase)) {
          query += ` AND phase IN (${phase.map(() => '?').join(',')})`;
          params.push(...phase);
        } else {
          query += ' AND phase = ?';
          params.push(phase);
        }
      }

      if (phase_status) {
        if (Array.isArray(phase_status)) {
          query += ` AND phase_status IN (${phase_status.map(() => '?').join(',')})`;
          params.push(...phase_status);
        } else {
          query += ' AND phase_status = ?';
          params.push(phase_status);
        }
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = database.prepare(query);
      const bugs = stmt.all(...params);

      // Calculate phase context
      const phaseContext = bugs.length > 0 ? {
        current_phase: bugs[0].phase || 'Not Set',
        phase_status: bugs[0].phase_status || 'Open',
        active_stakeholders: ['productmanager', 'programmanager', 'developer', 'tester', 'architect']
      } : undefined;

      const appliedFilters: { [key: string]: any } = {};
      if (status) appliedFilters.status = status;
      if (severity) appliedFilters.severity = severity;
      if (reported_by) appliedFilters.reported_by = reported_by;
      if (assigned_to) appliedFilters.assigned_to = assigned_to;
      if (phase) appliedFilters.phase = phase;
      if (phase_status) appliedFilters.phase_status = phase_status;

      const output = {
        data: bugs,
        total_count: bugs.length,
        filtered_count: bugs.length,
        phase_context: phaseContext,
        applied_filters: appliedFilters,
        pagination: { limit, offset: 0, has_more: false }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing bugs: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List Test Cases
server.registerTool(
  'list_test_cases',
  {
    title: 'List Test Cases',
    description: 'List test cases with optional filtering',
    inputSchema: {
      status: z.enum(['New', 'Passed', 'Failed']).optional(),
      assigned_to: z.enum(['tester', 'productmanager']).optional(),
      phase: z.union([z.string(), z.array(z.string())]).optional(),
      phase_status: z.union([z.string(), z.array(z.string())]).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
      data: z.array(z.object({
        id: z.number(),
        user_story_id: z.number().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        assigned_to: z.string().nullable(),
        phase: z.string().nullable(),
        phase_status: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string()
      })),
      total_count: z.number(),
      filtered_count: z.number(),
      phase_context: z.object({
        current_phase: z.string(),
        phase_status: z.string(),
        active_stakeholders: z.array(z.string())
      }).optional(),
      applied_filters: z.record(z.any()),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        has_more: z.boolean()
      }).optional()
    }
  },
  async ({ status, assigned_to, phase, phase_status, limit = 50 }) => {
    try {
      const database = getDatabase();
      let query = 'SELECT * FROM test_cases WHERE 1=1';
      const params: any[] = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (assigned_to) {
        query += ' AND assigned_to = ?';
        params.push(assigned_to);
      }

      if (phase) {
        if (Array.isArray(phase)) {
          query += ` AND phase IN (${phase.map(() => '?').join(',')})`;
          params.push(...phase);
        } else {
          query += ' AND phase = ?';
          params.push(phase);
        }
      }

      if (phase_status) {
        if (Array.isArray(phase_status)) {
          query += ` AND phase_status IN (${phase_status.map(() => '?').join(',')})`;
          params.push(...phase_status);
        } else {
          query += ' AND phase_status = ?';
          params.push(phase_status);
        }
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = database.prepare(query);
      const test_cases = stmt.all(...params);

      // Calculate phase context
      const phaseContext = test_cases.length > 0 ? {
        current_phase: test_cases[0].phase || 'Not Set',
        phase_status: test_cases[0].phase_status || 'New',
        active_stakeholders: ['tester', 'productmanager']
      } : undefined;

      const appliedFilters: { [key: string]: any } = {};
      if (status) appliedFilters.status = status;
      if (assigned_to) appliedFilters.assigned_to = assigned_to;
      if (phase) appliedFilters.phase = phase;
      if (phase_status) appliedFilters.phase_status = phase_status;

      const output = {
        data: test_cases,
        total_count: test_cases.length,
        filtered_count: test_cases.length,
        phase_context: phaseContext,
        applied_filters: appliedFilters,
        pagination: { limit, offset: 0, has_more: false }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing test cases: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Update Entity Status
server.registerTool(
  'update_entity_status',
  {
    title: 'Update Entity Status and Assignment',
    description: 'Update the status and/or assignment of any SDLC entity (epic, user_story, task, bug, test_case)',
    inputSchema: {
      entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
      entity_id: z.number(),
      status: z.string().optional(), // Will be validated by database CHECK constraints
      assigned_to: z.string().optional(), // Will be validated by database CHECK constraints
      phase: z.string().optional(),
      phase_status: z.string().optional(),
      transitioned_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect'])
    },
    outputSchema: {
      success: z.boolean(),
      entity_type: z.string(),
      entity_id: z.number(),
      old_status: z.string().nullable(),
      new_status: z.string().nullable(),
      old_assigned_to: z.string().nullable(),
      new_assigned_to: z.string().nullable(),
      old_phase: z.string().nullable(),
      new_phase: z.string().nullable(),
      old_phase_status: z.string().nullable(),
      new_phase_status: z.string().nullable()
    }
  },
  async ({ entity_type, entity_id, status, assigned_to, phase, phase_status, transitioned_by }) => {
    try {
      const tableName = {
        epic: 'epics',
        user_story: 'user_stories',
        task: 'tasks',
        bug: 'bugs',
        test_case: 'test_cases'
      }[entity_type];
      // Get current status, assigned_to, phase, and phase_status
      const database = getDatabase();
      const currentStmt = database.prepare(`SELECT status, assigned_to, phase, phase_status FROM ${tableName} WHERE id = ?`);
      const current = currentStmt.get(entity_id) as { status: string; assigned_to: string; phase: string; phase_status: string } | undefined;

      if (!current) {
        return {
          content: [{ type: 'text', text: `${entity_type} not found` }],
          isError: true
        };
      }

      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];

      if (status !== undefined) {
        updates.push('status = ?');
        params.push(status);
      }

      if (assigned_to !== undefined) {
        updates.push('assigned_to = ?');
        params.push(assigned_to);
      }

      if (phase !== undefined) {
        updates.push('phase = ?');
        params.push(phase);
      }

      if (phase_status !== undefined) {
        updates.push('phase_status = ?');
        params.push(phase_status);
      }

      if (updates.length === 0) {
        return {
          content: [{ type: 'text', text: `No updates specified for ${entity_type}` }],
          isError: true
        };
      }

      updates.push('updated_at = CURRENT_TIMESTAMP');

      const updateStmt = database.prepare(`
        UPDATE ${tableName}
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      params.push(entity_id);

      const result = updateStmt.run(...params);

      if (result.changes === 0) {
        return {
          content: [{ type: 'text', text: `Failed to update ${entity_type}` }],
          isError: true
        };
      }

      // Record transitions
      if (status !== undefined && status !== current.status) {
        const transitionStmt = database.prepare(`
          INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, transitioned_by)
          VALUES (?, ?, ?, ?, ?)
        `);
        transitionStmt.run(entity_type, entity_id, current.status, status, transitioned_by);
      }

      if (assigned_to !== undefined && assigned_to !== current.assigned_to) {
        const ownershipStmt = database.prepare(`
          INSERT INTO ownership_transitions (entity_type, entity_id, from_owner, to_owner, transitioned_by)
          VALUES (?, ?, ?, ?, ?)
        `);
        ownershipStmt.run(entity_type, entity_id, current.assigned_to, assigned_to, transitioned_by);
      }

      const output = {
        success: true,
        entity_type,
        entity_id,
        old_status: status !== undefined ? current.status : null,
        new_status: status !== undefined ? status : null,
        old_assigned_to: assigned_to !== undefined ? current.assigned_to : null,
        new_assigned_to: assigned_to !== undefined ? assigned_to : null,
        old_phase: phase !== undefined ? current.phase : null,
        new_phase: phase !== undefined ? phase : null,
        old_phase_status: phase_status !== undefined ? current.phase_status : null,
        new_phase_status: phase_status !== undefined ? phase_status : null
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error updating ${entity_type}: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: List tasks
server.registerTool(
  'list_tasks',
  {
    title: 'List Tasks',
    description: 'List tasks with optional filtering',
    inputSchema: {
      status: z.enum(['New', 'In Progress', 'Review', 'Closed']).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      phase: z.union([z.string(), z.array(z.string())]).optional(),
      phase_status: z.union([z.string(), z.array(z.string())]).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
      data: z.array(z.any()),
      total_count: z.number(),
      filtered_count: z.number(),
      phase_context: z.object({
        current_phase: z.string(),
        phase_status: z.string(),
        active_stakeholders: z.array(z.string())
      }).optional(),
      applied_filters: z.record(z.any()),
      pagination: z.object({
        limit: z.number(),
        offset: z.number(),
        has_more: z.boolean()
      }).optional()
    }
  },
   async ({ status, priority, phase, phase_status, limit = 50 }) => {
    try {
      const database = getDatabase();
      let query = 'SELECT * FROM tasks WHERE 1=1';
      const params: any[] = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      if (priority) {
        query += ' AND priority = ?';
        params.push(priority);
      }

      if (phase) {
        if (Array.isArray(phase)) {
          query += ` AND phase IN (${phase.map(() => '?').join(',')})`;
          params.push(...phase);
        } else {
          query += ' AND phase = ?';
          params.push(phase);
        }
      }

      if (phase_status) {
        if (Array.isArray(phase_status)) {
          query += ` AND phase_status IN (${phase_status.map(() => '?').join(',')})`;
          params.push(...phase_status);
        } else {
          query += ' AND phase_status = ?';
          params.push(phase_status);
        }
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = database.prepare(query);
      const tasks = stmt.all(...params);

      // Calculate phase context
      const phaseContext = tasks.length > 0 ? {
        current_phase: tasks[0].phase || 'Not Set',
        phase_status: tasks[0].phase_status || 'New',
        active_stakeholders: ['architect', 'developer']
      } : undefined;

      const appliedFilters: { [key: string]: any } = {};
      if (status) appliedFilters.status = status;
      if (priority) appliedFilters.priority = priority;
      if (phase) appliedFilters.phase = phase;
      if (phase_status) appliedFilters.phase_status = phase_status;

      const output = {
        data: tasks,
        total_count: tasks.length,
        filtered_count: tasks.length,
        phase_context: phaseContext,
        applied_filters: appliedFilters,
        pagination: { limit, offset: 0, has_more: false }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error listing tasks: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Update task status
server.registerTool(
  'update_task_status',
  {
    title: 'Update Task Status',
    description: 'Update the status of an existing task',
    inputSchema: {
      task_id: z.number(),
      status: z.enum(['New', 'In Progress', 'Review', 'Closed'])
    },
    outputSchema: {
      success: z.boolean(),
      task_id: z.number()
    }
  },
  async ({ task_id, status }) => {
    try {
      const database = getDatabase();
      const stmt = database.prepare(`
        UPDATE tasks
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      const result = stmt.run(status, task_id);

      if (result.changes === 0) {
        return {
          content: [{ type: 'text', text: 'Task not found' }],
          isError: true
        };
      }

      const output = {
        success: true,
        task_id
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error updating task: ${error.message}` }],
        isError: true
      };
    }
  }
);







// Connect to stdio transport and start HTTP server
async function main() {
  // Start MCP server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('MCP server connected and ready');

  // Start HTTP server after a brief delay to avoid interference
  setTimeout(async () => {
    const PORT = Math.floor(Math.random() * 7000) + 3000; // Random port 3000-9999
    httpPort = PORT;

    try {
  app.listen(PORT, () => {
    const url = `http://localhost:${PORT}`;
    console.error(`🌐 Web UI available at ${url}`);
    tryOpenBrowser(url);
  });
    } catch (error) {
      console.error('HTTP Server startup error:', error);
    }
  }, 1000); // 1 second delay

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.error('Shutting down servers');
    if (db) db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  db.close();
  process.exit(1);
});