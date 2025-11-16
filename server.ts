import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import { z } from 'zod';

// Initialize SQLite database
const db = new Database('tracker.db');

// Create tables if they don't exist
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
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'QA', 'Closed')),
    created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    current_owner TEXT NOT NULL DEFAULT 'productmanager' CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    assigned_to TEXT CHECK (assigned_to IN ('productmanager', 'architect', 'developer', 'tester')),
    story_points INTEGER,
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
    status TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New', 'In Progress', 'Closed')),
    created_by TEXT NOT NULL CHECK (created_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    current_owner TEXT NOT NULL DEFAULT 'architect' CHECK (current_owner IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    assigned_to TEXT CHECK (assigned_to IN ('architect', 'developer')),
    estimated_hours DECIMAL(5,2),
    actual_hours DECIMAL(5,2),
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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_run_at DATETIME,
    last_run_by TEXT CHECK (last_run_by IN ('productmanager', 'programmanager', 'developer', 'tester', 'architect')),
    FOREIGN KEY (user_story_id) REFERENCES user_stories(id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL CHECK (entity_type IN ("epic", "user_story", "task", "bug", "test_case")),
    entity_id INTEGER NOT NULL,
    comment_text TEXT NOT NULL,
    author TEXT NOT NULL CHECK (author IN ("productmanager", "programmanager", "developer", "tester", "architect")),
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
`);



// Create MCP server
const server = new McpServer({
  name: 'sqlite-tracker-server',
  version: '1.0.0'
});

// SDLC Entity Management Tools

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
    try {
      const stmt = db.prepare(`
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

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
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
        epic_id: z.number().optional(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        acceptance_criteria: z.string().optional(),
        story_points: z.number().optional(),
     assigned_to: z.string().optional()
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
    return {
      content: [{ type: 'text', text: 'User stories created' }]
    };
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
        user_story_id: z.number().optional(),
        title: z.string().min(1, 'Title is required'),
        description: z.string().optional(),
        assigned_to: z.enum(['architect', 'developer']).optional(),
        estimated_hours: z.number().optional()
       })).min(1, 'At least one task is required')
     },
     outputSchema: {
       tasks_created: z.array(z.object({
         task_id: z.number(),
         title: z.string(),
         success: z.boolean(),
         error: z.string().optional()
       })),
       total_created: z.number()
     }
  },
   async ({ tasks }) => {
     try {
       const stmt = db.prepare(`
         INSERT INTO tasks (user_story_id, title, description, assigned_to, estimated_hours, created_by)
         VALUES (?, ?, ?, ?, ?, ?)
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
        assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional()
      })).min(1, 'At least one bug is required')
    },
    outputSchema: {
      bugs_created: z.array(z.object({
        bug_id: z.number(),
        title: z.string(),
        success: z.boolean(),
        error: z.string().optional()
      })),
      total_created: z.number()
    }
  },
  async ({ bugs }) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO bugs (user_story_id, task_id, title, description, severity, reported_by, assigned_to, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
        assigned_to: z.enum(['tester', 'productmanager']).optional()
      })).min(1, 'At least one test case is required')
    }
  },
  async ({ test_cases }) => {
    try {
      const stmt = db.prepare(`
        INSERT INTO test_cases (user_story_id, title, description, preconditions, steps, expected_result, assigned_to)
        VALUES (?, ?, ?, ?, ?, ?, ?)
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
            testCase.assigned_to || 'tester'
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
      const stmt = db.prepare(`
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
          const entityCheck = db.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(comment.entity_id);
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
    }
  },
  async ({ status, limit = 50 }) => {
    try {
      let query = 'SELECT * FROM epics WHERE 1=1';
      const params: any[] = [];

      if (status) {
        query += ' AND status = ?';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(query);
      const epics = stmt.all(...params);

      const output = {
        epics,
        count: epics.length
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
      status: z.enum(['New', 'In Progress', 'QA', 'Closed']).optional(),
      assigned_to: z.enum(['productmanager', 'architect', 'developer', 'tester']).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
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
    }
  },
  async ({ epic_id, status, assigned_to, limit = 50 }) => {
    try {
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

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(query);
      const user_stories = stmt.all(...params);

      const output = {
        user_stories,
        count: user_stories.length
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
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
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
    }
  },
  async ({ status, severity, reported_by, assigned_to, limit = 50 }) => {
    try {
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

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(query);
      const bugs = stmt.all(...params);

      const output = {
        bugs,
        count: bugs.length
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
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: {
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
    }
  },
  async ({ status, assigned_to, limit = 50 }) => {
    try {
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

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(query);
      const test_cases = stmt.all(...params);

      const output = {
        test_cases,
        count: test_cases.length
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
    title: 'Update Entity Status',
    description: 'Update the status of any SDLC entity (epic, user_story, task, bug, test_case)',
    inputSchema: {
      entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
      entity_id: z.number(),
      status: z.string(), // Will be validated by database CHECK constraints
      transitioned_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect'])
    },
    outputSchema: {
      success: z.boolean(),
      entity_type: z.string(),
      entity_id: z.number(),
      old_status: z.string().nullable(),
      new_status: z.string()
    }
  },
  async ({ entity_type, entity_id, status, transitioned_by }) => {
    try {
      const tableName = {
        epic: 'epics',
        user_story: 'user_stories',
        task: 'tasks',
        bug: 'bugs',
        test_case: 'test_cases'
      }[entity_type];
      // Get current status
      const currentStmt = db.prepare(`SELECT status FROM ${tableName} WHERE id = ?`);
      const current = currentStmt.get(entity_id) as { status: string } | undefined;

      if (!current) {
        return {
          content: [{ type: 'text', text: `${entity_type} not found` }],
          isError: true
        };
      }

      // Update status
      const updateStmt = db.prepare(`
        UPDATE ${tableName}
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);
      const result = updateStmt.run(status, entity_id);

      if (result.changes === 0) {
        return {
          content: [{ type: 'text', text: `Failed to update ${entity_type} status` }],
          isError: true
        };
      }

      // Record status transition
      const transitionStmt = db.prepare(`
        INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, transitioned_by)
        VALUES (?, ?, ?, ?, ?)
      `);
      transitionStmt.run(entity_type, entity_id, current.status, status, transitioned_by);

      const output = {
        success: true,
        entity_type,
        entity_id,
        old_status: current.status,
        new_status: status
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error updating ${entity_type} status: ${error.message}` }],
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
      status: z.enum(['pending', 'in_progress', 'completed']).optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
      limit: z.number().min(1).max(100).optional()
    },
    outputSchema: z.any()
  },
   async ({ status, priority, limit = 50 }) => {
    try {
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

      query += ' ORDER BY created_at DESC LIMIT ?';
      params.push(limit);

      const stmt = db.prepare(query);
      const tasks = stmt.all(...params);

      const output = {
        tasks,
        count: tasks.length
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
      status: z.enum(['pending', 'in_progress', 'completed'])
    },
    outputSchema: {
      success: z.boolean(),
      task_id: z.number()
    }
  },
  async ({ task_id, status }) => {
    try {
      const stmt = db.prepare(`
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







// Connect to stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    db.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  db.close();
  process.exit(1);
});