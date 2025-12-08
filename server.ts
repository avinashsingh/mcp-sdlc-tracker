import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import Database from 'better-sqlite3';
import { z } from 'zod';
import { existsSync, statSync, readFileSync, writeFileSync } from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import open from 'open';
import { registerAllWikiTools } from './wiki-tools.js';
import { createDatabaseSchema } from './database-schema.js';
import { registerUpdateEntityStatus } from './tools/update-entity-status.js';
import { registerCreateTestCases } from './tools/create-test-cases.js';
import { registerCreateBugs } from './tools/create-bugs.js';
import { registerListBugs } from './tools/list-bugs.js';
import { registerCreateComments } from './tools/create-comments.js';
import { registerGetComments } from './tools/get-comments.js';
import { registerListTestCases } from './tools/list-test-cases.js';
import { registerGetKnowledgeGraph, get_knowledge_graph } from './tools/kg.js';
import { registerReadFullFile } from './tools/read-full-file.js';
import { registerWriteFullFile } from './tools/write-full-file.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global project path
let projectPath: string | null = null;

// Function to get the current project root path
function getRootPath(): string | null {
  return projectPath;
}

// Create Express app
const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

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



// Helper function to convert SQLite boolean integers to actual booleans
function convertSQLiteBooleans(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(convertSQLiteBooleans);
  if (typeof obj === 'object') {
    const result = { ...obj };
    for (const key in result) {
      if (key === 'archived' && (result[key] === 0 || result[key] === 1)) {
        result[key] = result[key] === 1;
      } else if (typeof result[key] === 'object') {
        result[key] = convertSQLiteBooleans(result[key]);
      }
    }
    return result;
  }
  return obj;
}

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

app.post('/api/initialize', async (req, res) => {
  try {
    const { currentProjectLocation } = req.body;

    if (!currentProjectLocation) {
      return res.status(400).json({
        success: false,
        error: 'currentProjectLocation is required'
      });
    }

    // Use currentProjectLocation as projectDir and construct dbFilePath
    const projectDir = currentProjectLocation;
    const dbFilePath = `${projectDir}/.project_tracker.db`;

    // Check if already initialized
    if (isInitialized) {
      return res.json({
        success: false,
        message: 'Database already initialized',
        databasePath: dbPath
      });
    }

    // Initialize database with full schema
    db = new Database(dbFilePath);
    dbPath = dbFilePath;

    // Execute all CREATE TABLE statements (same as MCP tool)
    createDatabaseSchema(db);

    isInitialized = true;
    projectPath = projectDir;

    // Try to open browser now that database is initialized
    if (httpPort) {
      const url = `http://localhost:${httpPort}`;
      setTimeout(() => tryOpenBrowser(url), 100); // Small delay to ensure server is ready
    }

    res.json({
      success: true,
      message: 'Database initialized successfully',
      databasePath: dbFilePath
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
      LEFT JOIN user_stories us ON e.id = us.epic_id AND us.archived = 0
      WHERE e.archived = 0
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
          WHERE us.epic_id = ? AND us.archived = 0
          GROUP BY us.id
          ORDER BY us.created_at DESC
        `).all(epic.id);

        // Add dependency information to each user story
        for (const userStory of epic.userStories) {
          // Get dependencies (stories this story depends on)
          const depRows = database.prepare(`
            SELECT dependency_story_id FROM story_dependencies WHERE dependent_story_id = ?
          `).all(userStory.id);
          userStory.dependencies = depRows.map(row => row.dependency_story_id);

          // Get dependent stories (stories that depend on this story)
          const depStoryRows = database.prepare(`
            SELECT dependent_story_id FROM story_dependencies WHERE dependency_story_id = ?
          `).all(userStory.id);
          userStory.dependent_stories = depStoryRows.map(row => row.dependent_story_id);
        }

      // Get comment count for epic
      epic.comment_count = database.prepare(`
        SELECT COUNT(*) as count FROM comments WHERE entity_type = 'epic' AND entity_id = ?
      `).get(epic.id).count;

      // Get dependencies (epics this epic depends on)
      const depRows = database.prepare(`
        SELECT dependency_epic_id FROM epic_dependencies WHERE dependent_epic_id = ?
      `).all(epic.id);
      epic.dependencies = depRows.map(row => row.dependency_epic_id);

      // Get dependent epics (epics that depend on this epic)
      const depEpicRows = database.prepare(`
        SELECT dependent_epic_id FROM epic_dependencies WHERE dependency_epic_id = ?
      `).all(epic.id);
      epic.dependent_epics = depEpicRows.map(row => row.dependent_epic_id);

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

    res.json(convertSQLiteBooleans(epics));
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

// Dashboard data API endpoint
app.get('/api/dashboard', async (req, res) => {
  try {
    const database = getDatabase();

    // Get all non-archived epics with their associated data
    const epics = database.prepare(`
      SELECT
        e.*,
        COUNT(DISTINCT us.id) as story_count,
        COUNT(DISTINCT t.id) as task_count,
        COUNT(DISTINCT b.id) as bug_count,
        COUNT(DISTINCT tc.id) as test_case_count,
        COUNT(DISTINCT c.id) as comment_count
      FROM epics e
      LEFT JOIN user_stories us ON e.id = us.epic_id AND us.archived = 0
      LEFT JOIN tasks t ON us.id = t.user_story_id
      LEFT JOIN bugs b ON us.id = b.user_story_id
      LEFT JOIN test_cases tc ON us.id = tc.user_story_id
      LEFT JOIN comments c ON e.id = c.entity_id AND c.entity_type = 'epic'
      WHERE e.archived = 0
      GROUP BY e.id
      ORDER BY e.created_at DESC
    `).all();

    res.json({ epics });
  } catch (error) {
    console.error('Error loading dashboard data:', error);
    res.status(500).json({ error: 'Failed to load dashboard data' });
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

    const tableName = entityType === 'user_story' ? 'user_stories' : `${entityType}s`;
    const comments = database.prepare(`
      SELECT c.*, u.created_by as author_name
      FROM comments c
      LEFT JOIN ${tableName} u ON c.entity_id = u.id
      WHERE c.entity_type = ? AND c.entity_id = ?
      ORDER BY c.created_at DESC
      LIMIT 10
    `).all(entityType, parseInt(entityId));

    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get entity transition history
app.get('/api/history/:entityType/:entityId', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { entityType, entityId } = req.params;
    const database = getDatabase();

    // Query all transition types for this entity
    const statusTransitions = database.prepare(`
      SELECT 'status_change' as action_type,
             from_status as old_value,
             to_status as new_value,
             transitioned_by as user,
             transitioned_at as timestamp
      FROM status_transitions
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY transitioned_at DESC
    `).all(entityType, parseInt(entityId));

    const ownershipTransitions = database.prepare(`
      SELECT 'assignment_change' as action_type,
             from_owner as old_value,
             to_owner as new_value,
             transitioned_by as user,
             transitioned_at as timestamp
      FROM ownership_transitions
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY transitioned_at DESC
    `).all(entityType, parseInt(entityId));

    const fieldChanges = database.prepare(`
      SELECT 'field_change' as action_type,
             field_name,
             old_value,
             new_value,
             changed_by as user,
             changed_at as timestamp
      FROM entity_changes
      WHERE entity_type = ? AND entity_id = ?
      ORDER BY changed_at DESC
    `).all(entityType, parseInt(entityId));

    // Combine and sort all transitions
    const allTransitions = [...statusTransitions, ...ownershipTransitions, ...fieldChanges]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(allTransitions);
  } catch (error) {
    console.error('Error loading history:', error);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// Search wiki pages
app.get('/api/search/wiki', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { q: query, fields = 'title,content', category, status, tags, limit = 20 } = req.query;
    const database = getDatabase();

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const searchFields = (fields as string).split(',').filter(f => ['title', 'content', 'summary'].includes(f));
    if (searchFields.length === 0) {
      return res.status(400).json({ error: 'At least one valid search field must be specified' });
    }

    const ftsQuery = `"${query}"*`;

    let sqlQuery = `
      SELECT wp.*,
             COUNT(c.id) as comment_count,
             1.0 as search_score,
             '' as title_highlight,
             '' as content_highlight,
             '' as summary_highlight
      FROM wiki_pages wp
      JOIN wiki_pages_fts wpf ON wp.id = wpf.rowid
      LEFT JOIN comments c ON c.entity_type = 'wiki_page' AND c.entity_id = wp.id
      WHERE wiki_pages_fts MATCH ?
    `;

    const params: any[] = [ftsQuery];

    // Add filters
    const conditions: string[] = [];
    if (status) {
      conditions.push('wp.status = ?');
      params.push(status);
    }
    if (category) {
      conditions.push('wp.category = ?');
      params.push(category);
    }
    if (tags) {
      const tagList = (tags as string).split(',');
      const tagConditions = tagList.map(() => 'wp.tags LIKE ?').join(' OR ');
      conditions.push(`(${tagConditions})`);
      tagList.forEach(tag => params.push(`%${tag.trim()}%`));
    }

    if (conditions.length > 0) {
      sqlQuery += ` AND ${conditions.join(' AND ')}`;
    }

    sqlQuery += `
      GROUP BY wp.id
      ORDER BY search_score ASC, wp.updated_at DESC
      LIMIT ?
    `;
    params.push(parseInt(limit as string));

    const stmt = database.prepare(sqlQuery);
    const pages = stmt.all(...params);

    // Parse tags and format results
    const results = pages.map(page => {
      if (page.tags) {
        try {
          page.tags = JSON.parse(page.tags);
        } catch {
          page.tags = [];
        }
      } else {
        page.tags = [];
      }

      // Convert BM25 score to relevance percentage (lower BM25 = higher relevance)
      if (page.search_score !== null) {
        page.relevance = Math.max(0, Math.min(100, Math.round((1 - page.search_score / 10) * 100)));
      }

      return page;
    });

    res.json({
      query: query,
      results: results,
      total_results: results.length,
      search_performed: true
    });
  } catch (error) {
    console.error('Error searching wiki:', error);
    res.status(500).json({ error: 'Failed to search wiki' });
  }
});

// Get epic details
// Wiki API Endpoints
app.get('/api/wiki', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const database = getDatabase();
    const { status, category, tags, linked_entity_type, linked_entity_id, limit = 50 } = req.query;

    let query = `
      SELECT wp.*,
             COUNT(c.id) as comment_count
      FROM wiki_pages wp
      LEFT JOIN comments c ON c.entity_type = 'wiki_page' AND c.entity_id = wp.id
    `;

    const conditions: string[] = [];
    const params: any[] = [];

    if (status) {
      conditions.push('wp.status = ?');
      params.push(status);
    }

    if (category) {
      conditions.push('wp.category = ?');
      params.push(category);
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags];
      const tagConditions = tagArray.map(() => 'wp.tags LIKE ?').join(' OR ');
      conditions.push(`(${tagConditions})`);
      tagArray.forEach((tag: string) => params.push(`%${tag}%`));
    }

    if (linked_entity_type && linked_entity_id) {
      query += `
        INNER JOIN wiki_page_links wpl ON wp.id = wpl.wiki_page_id
      `;
      conditions.push('wpl.entity_type = ? AND wpl.entity_id = ?');
      params.push(linked_entity_type, linked_entity_id);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += `
      GROUP BY wp.id
      ORDER BY wp.updated_at DESC
      LIMIT ?
    `;
    params.push(parseInt(limit as string) || 50);

    const stmt = database.prepare(query);
    const pages = stmt.all(...params);

    // Parse tags JSON and convert booleans
    pages.forEach(page => {
      if (page.tags) {
        try {
          page.tags = JSON.parse(page.tags);
        } catch {
          page.tags = [];
        }
      } else {
        page.tags = [];
      }
    });

    res.json(convertSQLiteBooleans(pages));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wiki/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const database = getDatabase();
    const { id } = req.params;

    const page = database.prepare('SELECT * FROM wiki_pages WHERE id = ?').get(parseInt(id));
    if (!page) {
      return res.status(404).json({ error: 'Wiki page not found' });
    }

    // Get comment count
    page.comment_count = database.prepare(`
      SELECT COUNT(*) as count FROM comments WHERE entity_type = 'wiki_page' AND entity_id = ?
    `).get(page.id).count;

    // Get linked entities
    const links = database.prepare(`
      SELECT entity_type, entity_id, link_type FROM wiki_page_links WHERE wiki_page_id = ?
    `).all(page.id);
    page.linked_entities = links;

    // Parse tags
    if (page.tags) {
      try {
        page.tags = JSON.parse(page.tags);
      } catch {
        page.tags = [];
      }
    } else {
      page.tags = [];
    }

    res.json(convertSQLiteBooleans(page));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/wiki', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const database = getDatabase();
    const { title, content, summary, tags, category, assigned_to } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    // Generate slug from title
    const slug = title.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();

    // Check if slug already exists
    const existing = database.prepare('SELECT id FROM wiki_pages WHERE slug = ?').get(slug);
    if (existing) {
      return res.status(400).json({ error: 'Wiki page with this title already exists' });
    }

    const stmt = database.prepare(`
      INSERT INTO wiki_pages
      (title, slug, content, summary, tags, category, created_by, current_owner, assigned_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const tagsJson = tags ? JSON.stringify(tags) : null;
    const result = stmt.run(
      title,
      slug,
      content,
      summary || null,
      tagsJson,
      category || null,
      'productmanager', // Default creator
      'productmanager', // Default owner
      assigned_to || null
    );

    res.json({
      success: true,
      wiki_page_id: result.lastInsertRowid,
      slug
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Archive wiki page endpoint
app.post('/api/archive-wiki', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const database = getDatabase();
    const { wiki_page_id, archive_reason } = req.body;

    if (!wiki_page_id) {
      return res.status(400).json({ error: 'wiki_page_id is required' });
    }

    // Check if wiki page exists
    const page = database.prepare('SELECT * FROM wiki_pages WHERE id = ?').get(wiki_page_id);
    if (!page) {
      return res.status(404).json({ error: 'Wiki page not found' });
    }

    // Check if already archived
    if (page.status === 'Archived') {
      return res.status(400).json({ error: 'Wiki page is already archived' });
    }

    // Archive the page
    const stmt = database.prepare(`
      UPDATE wiki_pages
      SET status = 'Archived', archived_at = CURRENT_TIMESTAMP, archived_by = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    // Use a default archiver since we don't have user context in this endpoint
    // In a real implementation, this would come from authenticated user
    const archivedBy = 'productmanager';

    const result = stmt.run(archivedBy, wiki_page_id);

    if (result.changes === 0) {
      return res.status(500).json({ error: 'Failed to archive wiki page' });
    }

    // Get the archived timestamp
    const archivedPage = database.prepare('SELECT archived_at FROM wiki_pages WHERE id = ?').get(wiki_page_id);

    res.json({
      success: true,
      wiki_page_id,
      archived_at: archivedPage.archived_at,
      archived_by: archivedBy
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/epic/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const database = getDatabase();

    const epic = database.prepare('SELECT * FROM epics WHERE id = ?').get(parseInt(id));
    if (!epic) {
      return res.status(404).json({ error: 'Epic not found' });
    }

    // Get user story count
    epic.user_story_count = database.prepare('SELECT COUNT(*) as count FROM user_stories WHERE epic_id = ?').get(parseInt(id)).count;

    // Get comment count
    epic.comment_count = database.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?').get('epic', parseInt(id)).count;

    // Get dependencies (epics this epic depends on)
    const depRows = database.prepare(`
      SELECT dependency_epic_id FROM epic_dependencies WHERE dependent_epic_id = ?
    `).all(parseInt(id));
    epic.dependencies = depRows.map(row => row.dependency_epic_id);

    // Get dependent epics (epics that depend on this epic)
    const depEpicRows = database.prepare(`
      SELECT dependent_epic_id FROM epic_dependencies WHERE dependency_epic_id = ?
    `).all(parseInt(id));
    epic.dependent_epics = depEpicRows.map(row => row.dependent_epic_id);

    res.json(convertSQLiteBooleans(epic));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user story details
app.get('/api/story/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const database = getDatabase();

    const story = database.prepare('SELECT * FROM user_stories WHERE id = ?').get(parseInt(id));
    if (!story) {
      return res.status(404).json({ error: 'User story not found' });
    }

    // Get dependencies
    story.dependencies = database.prepare(`
      SELECT dependency_story_id FROM story_dependencies WHERE dependent_story_id = ?
      ORDER BY created_at
    `).all(parseInt(id)).map((dep: any) => dep.dependency_story_id);

    // Get dependent stories
    story.dependent_stories = database.prepare(`
      SELECT dependent_story_id FROM story_dependencies WHERE dependency_story_id = ?
      ORDER BY created_at
    `).all(parseInt(id)).map((dep: any) => dep.dependent_story_id);

    // Get counts
    story.task_count = database.prepare('SELECT COUNT(*) as count FROM tasks WHERE user_story_id = ?').get(parseInt(id)).count;
    story.bug_count = database.prepare('SELECT COUNT(*) as count FROM bugs WHERE user_story_id = ?').get(parseInt(id)).count;
    story.test_case_count = database.prepare('SELECT COUNT(*) as count FROM test_cases WHERE user_story_id = ?').get(parseInt(id)).count;
    story.comment_count = database.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?').get('user_story', parseInt(id)).count;

    res.json(convertSQLiteBooleans(story));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user story content
app.post('/api/user-stories/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { title, description, story_points } = req.body;
    const database = getDatabase();

    // Check if story exists and is not archived
    const story = database.prepare('SELECT * FROM user_stories WHERE id = ?').get(parseInt(id));
    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'User story not found'
      });
    }

    if (story.archived) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update archived user story'
      });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    const changes: any[] = [];

    if (title !== undefined && title !== story.title) {
      updates.push('title = ?');
      params.push(title);
      changes.push({ field: 'title', old_value: story.title, new_value: title });
    }

    if (description !== undefined && description !== story.description) {
      updates.push('description = ?');
      params.push(description);
      changes.push({ field: 'description', old_value: story.description, new_value: description });
    }

    if (story_points !== undefined && story_points !== story.story_points) {
      updates.push('story_points = ?');
      params.push(story_points);
      changes.push({ field: 'story_points', old_value: story.story_points, new_value: story_points });
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No changes to update'
      });
    }

    // Add updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(parseInt(id));

    const sql = `UPDATE user_stories SET ${updates.join(', ')} WHERE id = ?`;
    const result = database.prepare(sql).run(...params);

    if (result.changes > 0) {
      res.json({
        success: true,
        story_id: parseInt(id),
        changes
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update user story'
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get task details
app.get('/api/task/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const database = getDatabase();

    const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(id));
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get comment count
    task.comment_count = database.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?').get('task', parseInt(id)).count;

    res.json(convertSQLiteBooleans(task));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task content
app.post('/api/tasks/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { title, description, estimated_hours, priority } = req.body;
    const database = getDatabase();

    // Check if task exists
    const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(id));
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Build update query dynamically
    const updates: string[] = [];
    const params: any[] = [];
    const changes: any[] = [];

    if (title !== undefined && title !== task.title) {
      updates.push('title = ?');
      params.push(title);
      changes.push({ field: 'title', old_value: task.title, new_value: title });
    }

    if (description !== undefined && description !== task.description) {
      updates.push('description = ?');
      params.push(description);
      changes.push({ field: 'description', old_value: task.description, new_value: description });
    }

    if (estimated_hours !== undefined && estimated_hours !== task.estimated_hours) {
      updates.push('estimated_hours = ?');
      params.push(estimated_hours);
      changes.push({ field: 'estimated_hours', old_value: task.estimated_hours, new_value: estimated_hours });
    }

    if (priority !== undefined && priority !== task.priority) {
      updates.push('priority = ?');
      params.push(priority);
      changes.push({ field: 'priority', old_value: task.priority, new_value: priority });
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No changes to update'
      });
    }

    // Add updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(parseInt(id));

    const sql = `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`;
    const result = database.prepare(sql).run(...params);

    if (result.changes > 0) {
      res.json({
        success: true,
        task_id: parseInt(id),
        changes
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to update task'
      });
    }

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user story status and assignment
app.post('/api/user-stories/:id/status', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { status, assigned_to, transitioned_by, phase, phase_status } = req.body;
    const database = getDatabase();

    // Check if story exists and is not archived
    const story = database.prepare('SELECT * FROM user_stories WHERE id = ?').get(parseInt(id));
    if (!story) {
      return res.status(404).json({
        success: false,
        error: 'User story not found'
      });
    }

    if (story.archived) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update archived user story'
      });
    }

    // Validate required fields
    if (!status && !assigned_to) {
      return res.status(400).json({
        success: false,
        error: 'At least status or assigned_to must be provided'
      });
    }

    if (!transitioned_by) {
      return res.status(400).json({
        success: false,
        error: 'transitioned_by is required'
      });
    }

    // Validate status transitions
    if (status !== undefined && status !== story.status) {
      // Check for QA transition requirements
      if (status === 'QA') {
        const openTasks = database.prepare(`
          SELECT id FROM tasks
          WHERE user_story_id = ? AND status != 'Closed'
        `).all(parseInt(id));

        if (openTasks.length > 0) {
          const openTaskIds = openTasks.map(task => task.id);
          return res.status(400).json({
            success: false,
            error: `Cannot move user story to QA: ${openTasks.length} tasks are not closed (IDs: ${openTaskIds.join(', ')})`,
            open_task_ids: openTaskIds
          });
        }
      }

      // Check for UAT transition requirements
      if (status === 'UAT') {
        const issues: string[] = [];

        // Check 1: All tasks must be closed
        const openTasks = database.prepare(`
          SELECT id FROM tasks
          WHERE user_story_id = ? AND status != 'Closed'
        `).all(parseInt(id));

        if (openTasks.length > 0) {
          const openTaskIds = openTasks.map(t => t.id);
          issues.push(`${openTasks.length} tasks not closed (IDs: ${openTaskIds.join(', ')})`);
        }

        // Check 2: All bugs must be closed
        const openBugs = database.prepare(`
          SELECT id FROM bugs
          WHERE user_story_id = ? AND status != 'Closed'
        `).all(parseInt(id));

        if (openBugs.length > 0) {
          const openBugIds = openBugs.map(b => b.id);
          issues.push(`${openBugs.length} bugs not closed (IDs: ${openBugIds.join(', ')})`);
        }

        // Check 3: All test cases must have passed
        const failedTestCases = database.prepare(`
          SELECT id FROM test_cases
          WHERE user_story_id = ? AND status != 'Passed'
        `).all(parseInt(id));

        if (failedTestCases.length > 0) {
          const failedTestCaseIds = failedTestCases.map(tc => tc.id);
          issues.push(`${failedTestCases.length} test cases not passed (IDs: ${failedTestCaseIds.join(', ')})`);
        }

        if (issues.length > 0) {
          return res.status(400).json({
            success: false,
            error: `Cannot move user story to UAT: ${issues.join(', ')}`,
            validation_details: {
              open_task_ids: openTasks.map(t => t.id),
              open_bug_ids: openBugs.map(b => b.id),
              failed_test_case_ids: failedTestCases.map(tc => tc.id)
            }
          });
        }
      }

      // Check for Closed transition requirements
      if (status === 'Closed') {
        if (story.status !== 'UAT') {
          return res.status(400).json({
            success: false,
            error: 'Cannot move user story to Closed: must come from UAT status'
          });
        }

        // Additional check: Ensure no open bugs when closing
        const openBugs = database.prepare(`
          SELECT id FROM bugs
          WHERE user_story_id = ? AND status != 'Closed'
        `).all(parseInt(id));

        if (openBugs.length > 0) {
          const openBugIds = openBugs.map(b => b.id);
          return res.status(400).json({
            success: false,
            error: `Cannot close user story: ${openBugs.length} bugs are not closed (IDs: ${openBugIds.join(', ')})`,
            open_bug_ids: openBugIds
          });
        }
      }
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
      updates.push('current_owner = ?');
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
      return res.status(400).json({
        success: false,
        error: 'No changes to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(parseInt(id));

    // Apply update in a transaction to ensure atomicity
    const transaction = database.transaction(() => {
      const updateStmt = database.prepare(`
        UPDATE user_stories
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      updateStmt.run(...params);

      // Record status transition if status changed
      if (status && story.status !== status) {
        database.prepare(`
          INSERT INTO status_transitions
          (entity_type, entity_id, from_status, to_status, transitioned_by)
          VALUES (?, ?, ?, ?, ?)
        `).run('user_story', parseInt(id), story.status, status, transitioned_by);
      }

      // Record ownership transition if assigned_to changed
      if (assigned_to !== undefined && story.assigned_to !== assigned_to) {
        database.prepare(`
          INSERT INTO ownership_transitions
          (entity_type, entity_id, from_owner, to_owner, transitioned_by)
          VALUES (?, ?, ?, ?, ?)
        `).run('user_story', parseInt(id), story.assigned_to, assigned_to, transitioned_by);
      }
    });

    transaction();

    res.json({
      success: true,
      entity_type: 'user_story',
      entity_id: parseInt(id),
      old_status: story.status,
      new_status: status || story.status,
      old_assigned_to: story.assigned_to,
      new_assigned_to: assigned_to !== undefined ? assigned_to : story.assigned_to,
      transitioned_by
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update task status and assignment
app.post('/api/tasks/:id/status', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { status, assigned_to, transitioned_by, phase, phase_status } = req.body;
    const database = getDatabase();

    // Check if task exists
    const task = database.prepare('SELECT * FROM tasks WHERE id = ?').get(parseInt(id));
    if (!task) {
      return res.status(404).json({
        success: false,
        error: 'Task not found'
      });
    }

    // Validate required fields
    if (!status && !assigned_to) {
      return res.status(400).json({
        success: false,
        error: 'At least status or assigned_to must be provided'
      });
    }

    if (!transitioned_by) {
      return res.status(400).json({
        success: false,
        error: 'transitioned_by is required'
      });
    }

    // Validate task status transitions and role restrictions
    if (status) {
      if (status === 'Prepare' && task.status !== 'New') {
        return res.status(400).json({
          success: false,
          error: 'Cannot move task to Prepare: must come from New status'
        });
      }

      if (status === 'Prepare' && transitioned_by !== 'programmanager') {
        return res.status(400).json({
          success: false,
          error: 'Only programmanager can move task to Prepare status'
        });
      }

      if (status === 'In Progress' && task.status === 'Prepare' && transitioned_by !== 'architect') {
        return res.status(400).json({
          success: false,
          error: 'Only architect can move task from Prepare to In Progress'
        });
      }

      if (status === 'Review' && task.status === 'In Progress' && transitioned_by !== 'developer') {
        return res.status(400).json({
          success: false,
          error: 'Only developer can move task from In Progress to Review'
        });
      }

      if (status === 'In Progress' && task.status === 'Review' && transitioned_by !== 'architect') {
        return res.status(400).json({
          success: false,
          error: 'Only architect can move task from Review to In Progress'
        });
      }

      if (status === 'In Progress' && task.status !== 'Prepare' && task.status !== 'Review') {
        return res.status(400).json({
          success: false,
          error: 'Cannot move task to In Progress: must come from Prepare or Review status'
        });
      }

      if (status === 'Closed' && task.status !== 'Review') {
        return res.status(400).json({
          success: false,
          error: 'Cannot close task: must come from Review status'
        });
      }
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
      updates.push('current_owner = ?');
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
      return res.status(400).json({
        success: false,
        error: 'No changes to update'
      });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(parseInt(id));

    // Apply update in a transaction to ensure atomicity
    const transaction = database.transaction(() => {
      const updateStmt = database.prepare(`
        UPDATE tasks
        SET ${updates.join(', ')}
        WHERE id = ?
      `);
      updateStmt.run(...params);

      // Record status transition if status changed
      if (status && task.status !== status) {
        database.prepare(`
          INSERT INTO status_transitions
          (entity_type, entity_id, from_status, to_status, transitioned_by)
          VALUES (?, ?, ?, ?, ?)
        `).run('task', parseInt(id), task.status, status, transitioned_by);
      }

      // Record ownership transition if assigned_to changed
      if (assigned_to !== undefined && task.assigned_to !== assigned_to) {
        database.prepare(`
          INSERT INTO ownership_transitions
          (entity_type, entity_id, from_owner, to_owner, transitioned_by)
          VALUES (?, ?, ?, ?, ?)
        `).run('task', parseInt(id), task.assigned_to, assigned_to, transitioned_by);
      }
    });

    transaction();

    res.json({
      success: true,
      entity_type: 'task',
      entity_id: parseInt(id),
      old_status: task.status,
      new_status: status || task.status,
      old_assigned_to: task.assigned_to,
      new_assigned_to: assigned_to !== undefined ? assigned_to : task.assigned_to,
      transitioned_by
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get bug details
app.get('/api/bug/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const database = getDatabase();

    const bug = database.prepare('SELECT * FROM bugs WHERE id = ?').get(parseInt(id));
    if (!bug) {
      return res.status(404).json({ error: 'Bug not found' });
    }

    // Get comment count
    bug.comment_count = database.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?').get('bug', parseInt(id)).count;

    res.json(convertSQLiteBooleans(bug));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get test case details
app.get('/api/test-case/:id', async (req, res) => {
  try {
    if (!isInitialized) {
      return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const database = getDatabase();

    const testCase = database.prepare('SELECT * FROM test_cases WHERE id = ?').get(parseInt(id));
    if (!testCase) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    // Get comment count
    testCase.comment_count = database.prepare('SELECT COUNT(*) as count FROM comments WHERE entity_type = ? AND entity_id = ?').get('test_case', parseInt(id)).count;

    res.json(convertSQLiteBooleans(testCase));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get knowledge graph
app.get('/api/get-knowledge-graph', async (req, res) => {
  try {
    const kg = get_knowledge_graph();
    res.json(kg);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Catch-all route for frontend routing (SPA support)
app.get('*', (req, res) => {
  if (!isInitialized) {
    return res.redirect('/init');
  }

  res.render('dashboard', {
    title: 'SDLC Tracker Dashboard'
  });
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
      message: z.string()
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
       createDatabaseSchema(db);

       // Manage .gitignore file
       const gitignorePath = `${projectDir}/.gitignore`;
       let gitignoreContent = '';

       if (existsSync(gitignorePath)) {
         // Read existing .gitignore
         gitignoreContent = readFileSync(gitignorePath, 'utf8');
       }

       // Check if .project_tracker.db is already in .gitignore
       const dbEntry = '.project_tracker.db';
       if (!gitignoreContent.includes(dbEntry)) {
         // Add the database file to .gitignore
         if (gitignoreContent && !gitignoreContent.endsWith('\n')) {
           gitignoreContent += '\n';
         }
         gitignoreContent += `${dbEntry}\n`;

         // Write back to .gitignore
         writeFileSync(gitignorePath, gitignoreContent, 'utf8');
         console.error(`✅ Added '${dbEntry}' to .gitignore`);
       }

       isInitialized = true;
       projectPath = projectDir;

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
        content: [{ type: 'text', text: `Error initializing database: ${error.message}` }],
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
        title: z.string().min(1),
        description: z.string().optional(),
        assigned_to: z.enum(['productmanager']).optional()
      })).min(1)
    },
    outputSchema: {
      results: z.array(z.object({
        success: z.boolean(),
        epic_id: z.number().optional(),
        error: z.string().optional()
      }))
    }
  },
  async ({ epics }) => {
    try {
      const database = getDatabase();
      const results = [];

      for (const epic of epics) {
        try {
          const stmt = database.prepare(`
            INSERT INTO epics (title, description, assigned_to, created_by, owner)
            VALUES (?, ?, ?, ?, ?)
          `);

          const result = stmt.run(
            epic.title,
            epic.description || null,
            epic.assigned_to || null,
            'productmanager', // Default creator
            'productmanager'  // Default owner
          );

          results.push({
            success: true,
            epic_id: result.lastInsertRowid as number
          });
        } catch (error) {
          results.push({
            success: false,
            error: error.message
          });
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }],
        structuredContent: { results }
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
          epic_id: z.number(),
          title: z.string().min(1),
        description: z.string().optional(),
        acceptance_criteria: z.string().optional(),
        story_points: z.number().optional(),
        assigned_to: z.enum(['productmanager', 'architect', 'developer', 'tester']).optional(),
        phase: z.string().optional(),
        phase_status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional()
      })).min(1)
    },
    outputSchema: {
      results: z.array(z.object({
        success: z.boolean(),
        user_story_id: z.number().optional(),
        error: z.string().optional()
      }))
    }
  },
  async ({ user_stories }) => {
    try {
      const database = getDatabase();
      const results = [];

      for (const story of user_stories) {
        try {
          // Validate foreign key if epic_id provided
          if (story.epic_id) {
            const epicExists = database.prepare('SELECT id FROM epics WHERE id = ?').get(story.epic_id);
            if (!epicExists) {
              results.push({
                success: false,
                error: `Epic with ID ${story.epic_id} does not exist`
              });
              continue;
            }
          }

          const stmt = database.prepare(`
            INSERT INTO user_stories (epic_id, title, description, acceptance_criteria, story_points, assigned_to, phase, phase_status, created_by, current_owner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const result = stmt.run(
            story.epic_id || null,
            story.title,
            story.description || null,
            story.acceptance_criteria || null,
            story.story_points || null,
            story.assigned_to || null,
            story.phase || null,
            story.phase_status || null,
            'productmanager', // Default creator
            story.assigned_to || 'productmanager' // Default owner
          );

          results.push({
            success: true,
            user_story_id: result.lastInsertRowid as number
          });
        } catch (error) {
          results.push({
            success: false,
            error: error.message
          });
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }],
        structuredContent: { results }
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
        title: z.string().min(1),
        description: z.string().optional(),
        estimated_hours: z.number().optional(),
        assigned_to: z.enum(['architect', 'developer']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        phase: z.string().optional(),
        phase_status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional()
      })).min(1)
    },
    outputSchema: {
      results: z.array(z.object({
        success: z.boolean(),
        task_id: z.number().optional(),
        error: z.string().optional()
      }))
    }
  },
  async ({ tasks }) => {
    try {
      const database = getDatabase();
      const results = [];

      for (const task of tasks) {
        try {
          // Validate foreign key - user_story_id is now required
          const storyExists = database.prepare('SELECT id FROM user_stories WHERE id = ?').get(task.user_story_id);
          if (!storyExists) {
            results.push({
              success: false,
              error: `User story with ID ${task.user_story_id} does not exist`
            });
            continue;
          }

          const stmt = database.prepare(`
            INSERT INTO tasks (user_story_id, title, description, estimated_hours, assigned_to, priority, phase, phase_status, created_by, current_owner)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          const result = stmt.run(
            task.user_story_id || null,
            task.title,
            task.description || null,
            task.estimated_hours || null,
            task.assigned_to || null,
            task.priority || null,
            task.phase || null,
            task.phase_status || null,
            'developer', // Default creator
            task.assigned_to || 'developer' // Default owner
          );

          results.push({
            success: true,
            task_id: result.lastInsertRowid as number
          });
        } catch (error) {
          results.push({
            success: false,
            error: error.message
          });
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify({ results }, null, 2) }],
        structuredContent: { results }
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error creating tasks: ${error.message}` }],
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
    description: 'List epics with optional status filtering (excludes archived by default)',
    inputSchema: {
      epic_id: z.number().optional(),
      status: z.enum(['New', 'Open', 'Closed']).optional(),
      include_archived: z.boolean().default(false),
      limit: z.number().default(50),
      dependencies_resolved: z.boolean().optional()
    },
    outputSchema: {
      data: z.array(z.object({
        id: z.number(),
        title: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        created_by: z.string(),
        owner: z.string(),
        assigned_to: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        archived: z.boolean(),
        user_story_count: z.number(),
        comment_count: z.number(),
        dependencies: z.array(z.number()),
        dependent_epics: z.array(z.number()),
        dependencies_resolved: z.boolean(),
        wiki_links: z.array(z.object({
          wiki_page_id: z.number(),
          title: z.string(),
          link_type: z.string()
        }))
      })),
      total_count: z.number(),
      filtered_count: z.number()
    }
  },
  async ({ epic_id, status, include_archived = false, limit = 50, dependencies_resolved }) => {
    try {
      const database = getDatabase();

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

      if (!include_archived) {
        conditions.push('e.archived = 0');
      }

      if (status) {
        conditions.push('e.status = ?');
        params.push(status);
      }

      if (epic_id) {
        conditions.push('e.id = ?');
        params.push(epic_id);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += `
        GROUP BY e.id
        ORDER BY e.created_at DESC
        LIMIT ?
      `;
      params.push(limit);

      const stmt = database.prepare(query);
      const epics = stmt.all(...params);

      // Add dependency information to each epic
      for (const epic of epics) {
        // Get dependencies (epics this epic depends on)
        const depRows = database.prepare(`
          SELECT dependency_epic_id FROM epic_dependencies WHERE dependent_epic_id = ?
        `).all(epic.id);
        epic.dependencies = depRows.map(row => row.dependency_epic_id);

        // Get dependent epics (epics that depend on this epic)
        const depEpicRows = database.prepare(`
          SELECT dependent_epic_id FROM epic_dependencies WHERE dependency_epic_id = ?
        `).all(epic.id);
        epic.dependent_epics = depEpicRows.map(row => row.dependent_epic_id);

        // Check if all dependencies are resolved (closed)
        if (epic.dependencies.length > 0) {
          const depStatusCheck = database.prepare(`
            SELECT COUNT(*) as total_deps, COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed_deps
            FROM epics WHERE id IN (${epic.dependencies.map(() => '?').join(',')})
          `).get(...epic.dependencies);

          epic.dependencies_resolved = depStatusCheck.total_deps === depStatusCheck.closed_deps;
        } else {
          epic.dependencies_resolved = true; // No dependencies means all are "resolved"
        }

        // Get linked wiki pages
        const wikiLinkRows = database.prepare(`
          SELECT wpl.wiki_page_id, wp.title, wpl.link_type
          FROM wiki_page_links wpl
          JOIN wiki_pages wp ON wpl.wiki_page_id = wp.id
          WHERE wpl.entity_type = 'epic' AND wpl.entity_id = ?
        `).all(epic.id);
        epic.wiki_links = wikiLinkRows;
      }

      // Apply dependencies_resolved filter if specified
      let filteredEpics = epics;
      if (dependencies_resolved !== undefined) {
        filteredEpics = epics.filter(epic => epic.dependencies_resolved === dependencies_resolved);
      }

      const output = {
        data: convertSQLiteBooleans(filteredEpics),
        total_count: epics.length,
        filtered_count: filteredEpics.length
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
    description: 'List user stories with filtering by epic, status, assignee, or dependencies_resolved status (excludes archived by default)',
    inputSchema: {
      user_story_id: z.number().optional(),
      epic_id: z.number().optional(),
      status: z.enum(['New', 'In Progress', 'QA', 'UAT', 'Closed']).optional(),
      assigned_to: z.enum(['productmanager', 'architect', 'developer', 'tester']).optional(),
      include_archived: z.boolean().default(false),
      limit: z.number().default(50),
      dependencies_resolved: z.boolean().optional()
    },
    outputSchema: {
      data: z.array(z.object({
        id: z.number(),
        epic_id: z.number().nullable(),
        title: z.string(),
        description: z.string().nullable(),
        acceptance_criteria: z.string().nullable(),
        status: z.string(),
        created_by: z.string(),
        current_owner: z.string(),
        assigned_to: z.string().nullable(),
        story_points: z.number().nullable(),
        phase: z.string().nullable(),
        phase_status: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        archived: z.boolean(),
        task_count: z.number(),
        bug_count: z.number(),
        test_case_count: z.number(),
        comment_count: z.number(),
        dependencies: z.array(z.number()),
        dependent_stories: z.array(z.number()),
        dependencies_resolved: z.boolean(),
        wiki_links: z.array(z.object({
          wiki_page_id: z.number(),
          title: z.string(),
          link_type: z.string()
        }))
      })),
      total_count: z.number(),
      filtered_count: z.number()
    }
  },
  async ({ user_story_id, epic_id, status, assigned_to, include_archived = false, limit = 50, dependencies_resolved }) => {
    try {
      const database = getDatabase();

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

      if (!include_archived) {
        conditions.push('us.archived = 0');
      }

      if (user_story_id) {
        conditions.push('us.id = ?');
        params.push(user_story_id);
      }

      if (epic_id) {
        conditions.push('us.epic_id = ?');
        params.push(epic_id);
      }

      if (status) {
        conditions.push('us.status = ?');
        params.push(status);
      }

      if (assigned_to) {
        conditions.push('us.assigned_to = ?');
        params.push(assigned_to);
      }

      if (conditions.length > 0) {
        query += ` WHERE ${conditions.join(' AND ')}`;
      }

      query += `
        GROUP BY us.id
        ORDER BY us.created_at DESC
        LIMIT ?
      `;
      params.push(limit);

      const stmt = database.prepare(query);
      const user_stories = stmt.all(...params);

      // Add dependency information to each user story
      for (const story of user_stories) {
        // Get dependencies (stories this story depends on)
        const depRows = database.prepare(`
          SELECT dependency_story_id FROM story_dependencies WHERE dependent_story_id = ?
        `).all(story.id);
        story.dependencies = depRows.map(row => row.dependency_story_id);

        // Get dependent stories (stories that depend on this story)
        const depStoryRows = database.prepare(`
          SELECT dependent_story_id FROM story_dependencies WHERE dependency_story_id = ?
        `).all(story.id);
        story.dependent_stories = depStoryRows.map(row => row.dependent_story_id);

        // Check if all dependencies are resolved (closed)
        if (story.dependencies.length > 0) {
          const depStatusCheck = database.prepare(`
            SELECT COUNT(*) as total_deps, COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed_deps
            FROM user_stories WHERE id IN (${story.dependencies.map(() => '?').join(',')})
          `).get(...story.dependencies);

          story.dependencies_resolved = depStatusCheck.total_deps === depStatusCheck.closed_deps;
        } else {
          story.dependencies_resolved = true; // No dependencies means all are "resolved"
        }

        // Get linked wiki pages
        const wikiLinkRows = database.prepare(`
          SELECT wpl.wiki_page_id, wp.title, wpl.link_type
          FROM wiki_page_links wpl
          JOIN wiki_pages wp ON wpl.wiki_page_id = wp.id
          WHERE wpl.entity_type = 'user_story' AND wpl.entity_id = ?
        `).all(story.id);
        story.wiki_links = wikiLinkRows;
      }

      // Apply dependencies_resolved filter if specified
      let filteredStories = user_stories;
      if (dependencies_resolved !== undefined) {
        filteredStories = user_stories.filter(story => story.dependencies_resolved === dependencies_resolved);
      }

      const output = {
        data: convertSQLiteBooleans(filteredStories),
        total_count: user_stories.length,
        filtered_count: filteredStories.length
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

// Tool: List Tasks
server.registerTool(
  'list_tasks',
  {
    title: 'List Tasks',
    description: 'List tasks with optional filtering by user story, status, assignee, dependency relationships, and dependencies_resolved status',
    inputSchema: {
      task_id: z.number().optional(),
      user_story_id: z.number().optional(),
      status: z.enum(['New', 'Prepare', 'In Progress', 'Review', 'Closed']).optional(),
      assigned_to: z.enum(['architect', 'developer']).optional(),
      depends_on: z.number().optional(), // Filter tasks that depend on this task ID
      depended_by: z.number().optional(), // Filter tasks that are depended on by this task ID
      has_dependencies: z.boolean().optional(), // Filter tasks that have (true) or don't have (false) any dependencies
      dependencies_resolved: z.boolean().optional(), // Filter tasks by dependency resolution status
      limit: z.number().default(50)
    },
    outputSchema: {
      data: z.array(z.object({
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
        phase: z.string().nullable(),
        phase_status: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        closed_at: z.string().nullable(),
        priority: z.string(),
        comment_count: z.number(),
        dependencies: z.array(z.number()),
        dependent_tasks: z.array(z.number()),
        dependencies_resolved: z.boolean(),
        wiki_links: z.array(z.object({
          wiki_page_id: z.number(),
          title: z.string(),
          link_type: z.string()
        }))
      })),
      total_count: z.number(),
      filtered_count: z.number()
    }
  },
  async ({ task_id, user_story_id, status, assigned_to, depends_on, depended_by, has_dependencies, dependencies_resolved, limit = 50 }) => {
    try {
      const database = getDatabase();

      let query = `SELECT * FROM tasks`;
      const conditions = [];
      const params = [];

      if (task_id) {
        conditions.push('id = ?');
        params.push(task_id);
      }

      if (user_story_id) {
        conditions.push('user_story_id = ?');
        params.push(user_story_id);
      }

      if (status) {
        conditions.push('status = ?');
        params.push(status);
      }

      if (assigned_to) {
        conditions.push('assigned_to = ?');
        params.push(assigned_to);
      }

      // Handle dependency filters that require JOINs
      let joinClause = '';
      if (depends_on !== undefined) {
        joinClause += ` INNER JOIN task_dependencies td_depends ON t.id = td_depends.dependent_task_id AND td_depends.dependency_task_id = ?`;
        params.push(depends_on);
      }

      if (depended_by !== undefined) {
        joinClause += ` INNER JOIN task_dependencies td_depended ON t.id = td_depended.dependency_task_id AND td_depended.dependent_task_id = ?`;
        params.push(depended_by);
      }

      if (has_dependencies !== undefined) {
        if (has_dependencies) {
          joinClause += ` INNER JOIN task_dependencies td_has ON t.id = td_has.dependent_task_id`;
        } else {
          // For tasks without dependencies, we need a LEFT JOIN and WHERE clause
          joinClause += ` LEFT JOIN task_dependencies td_has ON t.id = td_has.dependent_task_id`;
          conditions.push('td_has.dependency_task_id IS NULL');
        }
      }

      if (conditions.length > 0 || joinClause) {
        query = `SELECT DISTINCT t.* FROM tasks t${joinClause}`;
        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }
      }

      query += ` ORDER BY t.created_at DESC LIMIT ?`;
      params.push(limit);

      const stmt = database.prepare(query);
      const tasks = stmt.all(...params);

      // Add comment count and dependency information to each task
      for (const task of tasks) {
        task.comment_count = database.prepare(`
          SELECT COUNT(*) as count FROM comments WHERE entity_type = 'task' AND entity_id = ?
        `).get(task.id).count;

        // Get dependencies (tasks this task depends on)
        const depRows = database.prepare(`
          SELECT dependency_task_id FROM task_dependencies WHERE dependent_task_id = ?
        `).all(task.id);
        task.dependencies = depRows.map(row => row.dependency_task_id);

        // Get dependent tasks (tasks that depend on this task)
        const depTaskRows = database.prepare(`
          SELECT dependent_task_id FROM task_dependencies WHERE dependency_task_id = ?
        `).all(task.id);
        task.dependent_tasks = depTaskRows.map(row => row.dependent_task_id);

        // Check if all dependencies are resolved (closed)
        if (task.dependencies.length > 0) {
          const depStatusCheck = database.prepare(`
            SELECT COUNT(*) as total_deps, COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed_deps
            FROM tasks WHERE id IN (${task.dependencies.map(() => '?').join(',')})
          `).get(...task.dependencies);

          task.dependencies_resolved = depStatusCheck.total_deps === depStatusCheck.closed_deps;
        } else {
          task.dependencies_resolved = true; // No dependencies means all are "resolved"
        }

        // Get linked wiki pages
        const wikiLinkRows = database.prepare(`
          SELECT wpl.wiki_page_id, wp.title, wpl.link_type
          FROM wiki_page_links wpl
          JOIN wiki_pages wp ON wpl.wiki_page_id = wp.id
          WHERE wpl.entity_type = 'task' AND wpl.entity_id = ?
        `).all(task.id);
        task.wiki_links = wikiLinkRows;
      }

      // Apply dependencies_resolved filter if specified
      let filteredTasks = tasks;
      if (dependencies_resolved !== undefined) {
        filteredTasks = tasks.filter(task => task.dependencies_resolved === dependencies_resolved);
      }

      const output = {
        data: convertSQLiteBooleans(filteredTasks),
        total_count: tasks.length,
        filtered_count: filteredTasks.length
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

// Tool: Manage Story Dependencies
server.registerTool(
  'manage_story_dependencies',
  {
    title: 'Manage Story Dependencies',
    description: 'Add or remove dependencies for multiple user stories in bulk',
    inputSchema: {
      operations: z.array(z.object({
        story_id: z.number(),
        action: z.enum(['add', 'remove']),
        dependency_story_ids: z.array(z.number()).min(1)
      })).min(1)
    },
    outputSchema: {
      results: z.array(z.object({
        story_id: z.number(),
        success: z.boolean(),
        action: z.string(),
        added_dependencies: z.array(z.number()).optional(),
        removed_dependencies: z.array(z.number()).optional(),
        errors: z.array(z.string()).optional()
      }))
    }
  },
  async ({ operations }) => {
    try {
      const database = getDatabase();
      const results = [];

      // Process operations in a transaction
      const transaction = database.transaction(() => {
        operations.forEach(operation => {
          const { story_id, action, dependency_story_ids } = operation;
          const result = {
            story_id,
            success: true,
            action,
            added_dependencies: [],
            removed_dependencies: [],
            errors: []
          };

          try {
            // Validate story exists
            const story = database.prepare('SELECT id FROM user_stories WHERE id = ?').get(story_id);
            if (!story) {
              result.success = false;
              result.errors.push(`Story ${story_id} not found`);
              results.push(result);
              return;
            }

            dependency_story_ids.forEach(depStoryId => {
              // Validate dependency story exists
              const depStory = database.prepare('SELECT id FROM user_stories WHERE id = ?').get(depStoryId);
              if (!depStory) {
                result.errors.push(`Dependency story ${depStoryId} not found`);
                return;
              }

              // Prevent self-dependency
              if (story_id === depStoryId) {
                result.errors.push(`Cannot create self-dependency for story ${story_id}`);
                return;
              }

              // Check for circular dependencies
              if (wouldCreateCircularDependency(database, story_id, depStoryId)) {
                result.errors.push(`Circular dependency detected with story ${depStoryId}`);
                return;
              }

              if (action === 'add') {
                // Add dependency (ignore if already exists)
                database.prepare(`
                  INSERT OR IGNORE INTO story_dependencies
                  (dependent_story_id, dependency_story_id, created_by)
                  VALUES (?, ?, ?)
                `).run(story_id, depStoryId, 'productmanager');

                result.added_dependencies.push(depStoryId);

              } else if (action === 'remove') {
                // Remove dependency
                const deleteResult = database.prepare(`
                  DELETE FROM story_dependencies
                  WHERE dependent_story_id = ? AND dependency_story_id = ?
                `).run(story_id, depStoryId);

                if (deleteResult.changes > 0) {
                  result.removed_dependencies.push(depStoryId);
                } else {
                  result.errors.push(`Dependency on story ${depStoryId} not found`);
                }
              }
            });

            if (result.errors.length > 0) {
              result.success = false;
            }

          } catch (error) {
            result.success = false;
            result.errors.push(error.message);
          }

          results.push(result);
        });
      });

      transaction();

      return {
        content: [{ type: 'text', text: `Processed ${operations.length} story dependency operations` }],
        structuredContent: { results }
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to manage story dependencies: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Update Epic
server.registerTool(
  'update_epic',
  {
    title: 'Update Epic',
    description: 'Update epic title, description, status, assignment, and phases',
    inputSchema: {
      epic_id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      status: z.enum(['New', 'Open', 'Closed']).optional(),
      assigned_to: z.enum(['productmanager']).optional(),
      phase: z.string().optional(),
      phase_status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional()
    },
    outputSchema: {
      success: z.boolean(),
      epic_id: z.number(),
      changes: z.array(z.object({
        field: z.string(),
        old_value: z.any(),
        new_value: z.any()
      })).optional(),
      error: z.string().optional()
    }
  },
  async ({ epic_id, title, description, status, assigned_to, phase, phase_status }) => {
    try {
      const database = getDatabase();

      // Check if epic exists and is not archived
      const epic = database.prepare('SELECT * FROM epics WHERE id = ?').get(epic_id);
      if (!epic) {
        return {
          content: [{ type: 'text', text: 'Epic not found' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'Epic not found'
          }
        };
      }

      if (epic.archived) {
        return {
          content: [{ type: 'text', text: 'Cannot update archived epic' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'Cannot update archived epic'
          }
        };
      }

      // Build update query dynamically
      const updates = [];
      const params = [];
      const changes = [];

      if (title !== undefined && title !== epic.title) {
        updates.push('title = ?');
        params.push(title);
        changes.push({ field: 'title', old_value: epic.title, new_value: title });
      }

      if (description !== undefined && description !== epic.description) {
        updates.push('description = ?');
        params.push(description);
        changes.push({ field: 'description', old_value: epic.description, new_value: description });
      }

       if (status !== undefined && status !== epic.status) {
         // Validate epic closure requirements
         if (status === 'Closed') {
           const openStories = database.prepare(`
             SELECT COUNT(*) as count FROM user_stories
             WHERE epic_id = ? AND status != 'Closed'
           `).get(epic_id).count;

           if (openStories > 0) {
             return {
               content: [{ type: 'text', text: `Cannot close epic: ${openStories} user stories are not closed` }],
               structuredContent: {
                 success: false,
                 epic_id,
                 error: `Cannot close epic: ${openStories} user stories are not closed`
               }
             };
           }
         }

         updates.push('status = ?');
         params.push(status);
         changes.push({ field: 'status', old_value: epic.status, new_value: status });
       }

      if (assigned_to !== undefined && assigned_to !== epic.assigned_to) {
        updates.push('assigned_to = ?');
        params.push(assigned_to);
        changes.push({ field: 'assigned_to', old_value: epic.assigned_to, new_value: assigned_to });
      }

      if (phase !== undefined && phase !== epic.phase) {
        updates.push('phase = ?');
        params.push(phase);
        changes.push({ field: 'phase', old_value: epic.phase, new_value: phase });
      }

      if (phase_status !== undefined && phase_status !== epic.phase_status) {
        updates.push('phase_status = ?');
        params.push(phase_status);
        changes.push({ field: 'phase_status', old_value: epic.phase_status, new_value: phase_status });
      }

      if (updates.length === 0) {
        return {
          content: [{ type: 'text', text: 'No changes to update' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'No changes to update'
          }
        };
      }

      // Add updated_at timestamp
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(epic_id);

      const sql = `UPDATE epics SET ${updates.join(', ')} WHERE id = ?`;
      const result = database.prepare(sql).run(...params);

      if (result.changes > 0) {
        return {
          content: [{ type: 'text', text: `Epic ${epic_id} updated successfully` }],
          structuredContent: {
            success: true,
            epic_id,
            changes
          }
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Failed to update epic' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'Failed to update epic'
          }
        };
      }

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error updating epic: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Archive Epic
server.registerTool(
  'archive_epic',
  {
    title: 'Archive Epic',
    description: 'Archive epics (product managers only)',
    inputSchema: {
      epic_id: z.number(),
      archive_reason: z.string().optional()
    },
    outputSchema: {
      success: z.boolean(),
      epic_id: z.number(),
      error: z.string().optional()
    }
  },
  async ({ epic_id, archive_reason }) => {
    try {
      const database = getDatabase();

      // Check if epic exists
      const epic = database.prepare('SELECT * FROM epics WHERE id = ?').get(epic_id);
      if (!epic) {
        return {
          content: [{ type: 'text', text: 'Epic not found' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'Epic not found'
          }
        };
      }

      if (epic.archived) {
        return {
          content: [{ type: 'text', text: 'Epic is already archived' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'Epic is already archived'
          }
        };
      }

      // Archive the epic
      const result = database.prepare(`
        UPDATE epics
        SET archived = 1, archived_at = CURRENT_TIMESTAMP, archive_reason = ?
        WHERE id = ?
      `).run(archive_reason || null, epic_id);

      if (result.changes > 0) {
        return {
          content: [{ type: 'text', text: `Epic ${epic_id} archived successfully` }],
          structuredContent: {
            success: true,
            epic_id
          }
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Failed to archive epic' }],
          structuredContent: {
            success: false,
            epic_id,
            error: 'Failed to archive epic'
          }
        };
      }

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error archiving epic: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Update User Story Content
server.registerTool(
  'update_user_story_content',
  {
    title: 'Update User Story Content',
    description: 'Update user story title, description, and story points (all stakeholders)',
    inputSchema: {
      story_id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      story_points: z.number().optional()
    },
    outputSchema: {
      success: z.boolean(),
      story_id: z.number(),
      changes: z.array(z.object({
        field: z.string(),
        old_value: z.any(),
        new_value: z.any()
      })).optional(),
      error: z.string().optional()
    }
  },
  async ({ story_id, title, description, story_points }) => {
    try {
      const database = getDatabase();

      // Check if story exists and is not archived
      const story = database.prepare('SELECT * FROM user_stories WHERE id = ?').get(story_id);
      if (!story) {
        return {
          content: [{ type: 'text', text: 'User story not found' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'User story not found'
          }
        };
      }

      if (story.archived) {
        return {
          content: [{ type: 'text', text: 'Cannot update archived user story' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'Cannot update archived user story'
          }
        };
      }

      // Build update query dynamically
      const updates = [];
      const params = [];
      const changes = [];

      if (title !== undefined && title !== story.title) {
        updates.push('title = ?');
        params.push(title);
        changes.push({ field: 'title', old_value: story.title, new_value: title });
      }

      if (description !== undefined && description !== story.description) {
        updates.push('description = ?');
        params.push(description);
        changes.push({ field: 'description', old_value: story.description, new_value: description });
      }

      if (story_points !== undefined && story_points !== story.story_points) {
        updates.push('story_points = ?');
        params.push(story_points);
        changes.push({ field: 'story_points', old_value: story.story_points, new_value: story_points });
      }

      if (updates.length === 0) {
        return {
          content: [{ type: 'text', text: 'No changes to update' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'No changes to update'
          }
        };
      }

      // Add updated_at timestamp
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(story_id);

      const sql = `UPDATE user_stories SET ${updates.join(', ')} WHERE id = ?`;
      const result = database.prepare(sql).run(...params);

      if (result.changes > 0) {
        return {
          content: [{ type: 'text', text: `User story ${story_id} updated successfully` }],
          structuredContent: {
            success: true,
            story_id,
            changes
          }
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Failed to update user story' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'Failed to update user story'
          }
        };
      }

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error updating user story: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Update User Story Acceptance Criteria
server.registerTool(
  'update_user_story_acceptance_criteria',
  {
    title: 'Update User Story Acceptance Criteria',
    description: 'Update user story acceptance criteria (product managers only)',
    inputSchema: {
      story_id: z.number(),
      acceptance_criteria: z.string()
    },
    outputSchema: {
      success: z.boolean(),
      story_id: z.number(),
      old_acceptance_criteria: z.string().nullable(),
      new_acceptance_criteria: z.string(),
      error: z.string().optional()
    }
  },
  async ({ story_id, acceptance_criteria }) => {
    try {
      const database = getDatabase();

      // Check if story exists and is not archived
      const story = database.prepare('SELECT * FROM user_stories WHERE id = ?').get(story_id);
      if (!story) {
        return {
          content: [{ type: 'text', text: 'User story not found' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'User story not found'
          }
        };
      }

      if (story.archived) {
        return {
          content: [{ type: 'text', text: 'Cannot update archived user story' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'Cannot update archived user story'
          }
        };
      }

      // Update acceptance criteria
      const result = database.prepare(`
        UPDATE user_stories
        SET acceptance_criteria = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(acceptance_criteria, story_id);

      if (result.changes > 0) {
        return {
          content: [{ type: 'text', text: `User story ${story_id} acceptance criteria updated successfully` }],
          structuredContent: {
            success: true,
            story_id,
            old_acceptance_criteria: story.acceptance_criteria,
            new_acceptance_criteria: acceptance_criteria
          }
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Failed to update user story acceptance criteria' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'Failed to update user story acceptance criteria'
          }
        };
      }

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error updating user story acceptance criteria: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Archive User Story
server.registerTool(
  'archive_user_story',
  {
    title: 'Archive User Story',
    description: 'Archive user stories (product managers only)',
    inputSchema: {
      story_id: z.number(),
      archive_reason: z.string().optional()
    },
    outputSchema: {
      success: z.boolean(),
      story_id: z.number(),
      error: z.string().optional()
    }
  },
  async ({ story_id, archive_reason }) => {
    try {
      const database = getDatabase();

      // Check if story exists
      const story = database.prepare('SELECT * FROM user_stories WHERE id = ?').get(story_id);
      if (!story) {
        return {
          content: [{ type: 'text', text: 'User story not found' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'User story not found'
          }
        };
      }

      if (story.archived) {
        return {
          content: [{ type: 'text', text: 'User story is already archived' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'User story is already archived'
          }
        };
      }

      // Archive the user story
      const result = database.prepare(`
        UPDATE user_stories
        SET archived = 1, archived_at = CURRENT_TIMESTAMP, archive_reason = ?
        WHERE id = ?
      `).run(archive_reason || null, story_id);

      if (result.changes > 0) {
        return {
          content: [{ type: 'text', text: `User story ${story_id} archived successfully` }],
          structuredContent: {
            success: true,
            story_id
          }
        };
      } else {
        return {
          content: [{ type: 'text', text: 'Failed to archive user story' }],
          structuredContent: {
            success: false,
            story_id,
            error: 'Failed to archive user story'
          }
        };
      }

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Error archiving user story: ${error.message}` }],
        isError: true
      };
    }
  }
);

// Tool: Manage Epic Dependencies
server.registerTool(
  'manage_epic_dependencies',
  {
    title: 'Manage Epic Dependencies',
    description: 'Add or remove dependencies for multiple epics in bulk',
    inputSchema: {
      operations: z.array(z.object({
        epic_id: z.number(),
        action: z.enum(['add', 'remove']),
        dependency_epic_ids: z.array(z.number()).min(1)
      })).min(1)
    },
    outputSchema: {
      results: z.array(z.object({
        epic_id: z.number(),
        success: z.boolean(),
        action: z.string(),
        added_dependencies: z.array(z.number()).optional(),
        removed_dependencies: z.array(z.number()).optional(),
        errors: z.array(z.string()).optional()
      }))
    }
  },
  async ({ operations }) => {
    try {
      const database = getDatabase();
      const results = [];

      // Process operations in a transaction
      const transaction = database.transaction(() => {
        operations.forEach(operation => {
          const { epic_id, action, dependency_epic_ids } = operation;
          const result = {
            epic_id,
            success: true,
            action,
            added_dependencies: [],
            removed_dependencies: [],
            errors: []
          };

          try {
            // Validate epic exists
            const epic = database.prepare('SELECT id FROM epics WHERE id = ?').get(epic_id);
            if (!epic) {
              result.success = false;
              result.errors.push(`Epic ${epic_id} not found`);
              results.push(result);
              return;
            }

            dependency_epic_ids.forEach(depEpicId => {
              // Validate dependency epic exists
              const depEpic = database.prepare('SELECT id FROM epics WHERE id = ?').get(depEpicId);
              if (!depEpic) {
                result.errors.push(`Dependency epic ${depEpicId} not found`);
                return;
              }

              // Check for self-dependency
              if (epic_id === depEpicId) {
                result.errors.push(`Cannot create self-dependency for epic ${epic_id}`);
                return;
              }

              // Check for circular dependency
              if (action === 'add') {
                // Check if depEpicId already depends on epic_id (directly or indirectly)
                const reverseDependencyExists = database.prepare(`
                  WITH RECURSIVE dependency_chain(dependent_id, dependency_id) AS (
                    SELECT dependent_epic_id, dependency_epic_id FROM epic_dependencies
                    WHERE dependent_epic_id = ?
                    UNION ALL
                    SELECT ed.dependent_epic_id, ed.dependency_epic_id
                    FROM epic_dependencies ed
                    INNER JOIN dependency_chain dc ON ed.dependent_epic_id = dc.dependency_id
                  )
                  SELECT 1 FROM dependency_chain WHERE dependency_id = ?
                  LIMIT 1
                `).get(depEpicId, epic_id);

                if (reverseDependencyExists) {
                  result.errors.push(`Adding dependency ${epic_id} → ${depEpicId} would create circular dependency`);
                  return;
                }
              }

              if (action === 'add') {
                // Check if dependency already exists
                const existing = database.prepare(`
                  SELECT id FROM epic_dependencies
                  WHERE dependent_epic_id = ? AND dependency_epic_id = ?
                `).get(epic_id, depEpicId);

                if (!existing) {
                  database.prepare(`
                    INSERT INTO epic_dependencies (dependent_epic_id, dependency_epic_id, created_by)
                    VALUES (?, ?, ?)
                  `).run(epic_id, depEpicId, 'productmanager');
                  result.added_dependencies.push(depEpicId);
                }
              } else if (action === 'remove') {
                const deleted = database.prepare(`
                  DELETE FROM epic_dependencies
                  WHERE dependent_epic_id = ? AND dependency_epic_id = ?
                `).run(epic_id, depEpicId);

                if (deleted.changes > 0) {
                  result.removed_dependencies.push(depEpicId);
                }
              }
            });

            // Mark as failed if there were any errors
            if (result.errors.length > 0) {
              result.success = false;
            }

          } catch (error) {
            result.success = false;
            result.errors.push(`Database error: ${error.message}`);
          }

          results.push(result);
        });
      });

      // Execute transaction
      transaction();

      return {
        content: [{ type: 'text', text: `Processed ${operations.length} epic dependency operations` }],
        structuredContent: {
          results
        }
      };

    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to manage epic dependencies: ${error.message}` }],
        isError: true
      };
    }
   }
 );

// Tool: Manage Task Dependencies
server.registerTool(
  'manage_task_dependencies',
  {
    title: 'Manage Task Dependencies',
    description: 'Add or remove dependencies for multiple tasks in bulk (tasks must belong to the same user story)',
    inputSchema: {
      operations: z.array(z.object({
        task_id: z.number(),
        action: z.enum(['add', 'remove']),
        dependency_task_ids: z.array(z.number()).min(1)
      })).min(1)
    },
    outputSchema: {
      results: z.array(z.object({
        task_id: z.number(),
        success: z.boolean(),
        action: z.string(),
        added_dependencies: z.array(z.number()).optional(),
        removed_dependencies: z.array(z.number()).optional(),
        errors: z.array(z.string()).optional()
      }))
    }
  },
  async ({ operations }) => {
    try {
      const database = getDatabase();
      const results = [];

      for (const operation of operations) {
        try {
          const { task_id, action, dependency_task_ids } = operation;

          // Validate that the dependent task exists
          const dependentTask = database.prepare('SELECT id, user_story_id FROM tasks WHERE id = ?').get(task_id);
          if (!dependentTask) {
            results.push({
              task_id,
              success: false,
              action,
              errors: [`Task ${task_id} does not exist`]
            });
            continue;
          }

          const addedDependencies = [];
          const removedDependencies = [];
          const errors = [];

          for (const dependencyTaskId of dependency_task_ids) {
            try {
              // Validate that the dependency task exists
              const dependencyTask = database.prepare('SELECT id, user_story_id FROM tasks WHERE id = ?').get(dependencyTaskId);
              if (!dependencyTask) {
                errors.push(`Dependency task ${dependencyTaskId} does not exist`);
                continue;
              }

              // Validate that both tasks belong to the same user story
              if (dependentTask.user_story_id !== dependencyTask.user_story_id) {
                errors.push(`Tasks ${task_id} and ${dependencyTaskId} belong to different user stories (${dependentTask.user_story_id} vs ${dependencyTask.user_story_id})`);
                continue;
              }

              // Prevent self-dependency
              if (task_id === dependencyTaskId) {
                errors.push(`Task ${task_id} cannot depend on itself`);
                continue;
              }

              // Check for existing dependency
              const existingDependency = database.prepare(
                'SELECT id FROM task_dependencies WHERE dependent_task_id = ? AND dependency_task_id = ?'
              ).get(task_id, dependencyTaskId);

              if (action === 'add') {
                if (existingDependency) {
                  errors.push(`Dependency already exists between tasks ${task_id} and ${dependencyTaskId}`);
                  continue;
                }

                // Check for circular dependency
                const wouldCreateCircular = database.prepare(`
                  WITH RECURSIVE dependency_chain AS (
                    SELECT dependent_task_id, dependency_task_id
                    FROM task_dependencies
                    WHERE dependent_task_id = ?
                    UNION ALL
                    SELECT td.dependent_task_id, td.dependency_task_id
                    FROM task_dependencies td
                    INNER JOIN dependency_chain dc ON td.dependent_task_id = dc.dependency_task_id
                  )
                  SELECT 1 FROM dependency_chain WHERE dependency_task_id = ?
                `).get(dependencyTaskId, task_id);

                if (wouldCreateCircular) {
                  errors.push(`Adding dependency would create circular dependency between tasks ${task_id} and ${dependencyTaskId}`);
                  continue;
                }

                // Add the dependency
                database.prepare(
                  'INSERT INTO task_dependencies (dependent_task_id, dependency_task_id, created_by) VALUES (?, ?, ?)'
                ).run(task_id, dependencyTaskId, 'productmanager'); // Default to productmanager for now

                addedDependencies.push(dependencyTaskId);
              } else if (action === 'remove') {
                if (!existingDependency) {
                  errors.push(`No dependency exists between tasks ${task_id} and ${dependencyTaskId}`);
                  continue;
                }

                // Remove the dependency
                database.prepare(
                  'DELETE FROM task_dependencies WHERE dependent_task_id = ? AND dependency_task_id = ?'
                ).run(task_id, dependencyTaskId);

                removedDependencies.push(dependencyTaskId);
              }
            } catch (error) {
              errors.push(`Error processing dependency ${dependencyTaskId}: ${error.message}`);
            }
          }

          results.push({
            task_id,
            success: errors.length === 0,
            action,
            added_dependencies: addedDependencies.length > 0 ? addedDependencies : undefined,
            removed_dependencies: removedDependencies.length > 0 ? removedDependencies : undefined,
            errors: errors.length > 0 ? errors : undefined
          });
        } catch (error) {
          results.push({
            task_id: operation.task_id,
            success: false,
            action: operation.action,
            errors: [`Unexpected error: ${error.message}`]
          });
        }
      }

      return {
        content: [{ type: 'text', text: `Processed ${results.filter(r => r.success).length} of ${operations.length} task dependency operations` }],
        structuredContent: { results }
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `Failed to manage task dependencies: ${error.message}` }],
        isError: true
      };
    }
  }
 );

// Register all wiki tools
// Register additional tools
registerUpdateEntityStatus(server, getDatabase);
registerCreateTestCases(server, getDatabase);
registerCreateBugs(server, getDatabase);
registerListBugs(server, getDatabase);
registerCreateComments(server, getDatabase);
registerGetComments(server, getDatabase);
registerListTestCases(server, getDatabase);
//registerReadFullFile(server);
//registerWriteFullFile(server);

//registerGetKnowledgeGraph(server, getRootPath, () => isInitialized);

registerAllWikiTools(server, getDatabase);

// Connect to stdio transport and start HTTP server

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
