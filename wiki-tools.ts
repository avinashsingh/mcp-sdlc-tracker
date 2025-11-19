// Wiki Tools for SDLC Tracker
// This file contains all wiki-related MCP tools

import { z } from 'zod';

// Helper function to get database (imported from main server)
declare function getDatabase(): any;

// Tool: Create Wiki Page
export function registerCreateWikiPage(server: any) {
  server.registerTool(
    'create_wiki_page',
    {
      title: 'Create Wiki Page',
      description: 'Create a new wiki page with content, category, and tags',
      inputSchema: {
        title: z.string().min(1),
        content: z.string().min(1),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
        category: z.enum(['technical', 'process', 'business', 'qa', 'knowledge']).optional(),
        assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional()
      },
      outputSchema: {
        success: z.boolean(),
        wiki_page_id: z.number(),
        slug: z.string()
      }
    },
    async ({ title, content, summary, tags, category, assigned_to }) => {
      try {
        const database = getDatabase();

        // Generate slug from title
        const slug = title.toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .replace(/-+/g, '-')
          .trim();

        // Check if slug already exists
        const existing = database.prepare('SELECT id FROM wiki_pages WHERE slug = ?').get(slug);
        if (existing) {
          return {
            content: [{ type: 'text', text: 'Wiki page with this title already exists' }],
            isError: true
          };
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

        const output = {
          success: true,
          wiki_page_id: result.lastInsertRowid,
          slug
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error creating wiki page: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// Tool: Update Wiki Page
export function registerUpdateWikiPage(server: any) {
  server.registerTool(
    'update_wiki_page',
    {
      title: 'Update Wiki Page',
      description: 'Update an existing wiki page content, metadata, and links',
      inputSchema: {
        wiki_page_id: z.number(),
        title: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        summary: z.string().optional(),
        tags: z.array(z.string()).optional(),
        category: z.enum(['technical', 'process', 'business', 'qa', 'knowledge']).optional(),
        assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
        change_reason: z.string().optional()
      },
      outputSchema: {
        success: z.boolean(),
        wiki_page_id: z.number(),
        new_version: z.number()
      }
    },
    async ({ wiki_page_id, title, content, summary, tags, category, assigned_to, change_reason }) => {
      try {
        const database = getDatabase();

        // Get current page data
        const currentPage = database.prepare('SELECT * FROM wiki_pages WHERE id = ?').get(wiki_page_id);
        if (!currentPage) {
          return {
            content: [{ type: 'text', text: 'Wiki page not found' }],
            isError: true
          };
        }

        // Create revision record
        const revisionStmt = database.prepare(`
          INSERT INTO wiki_page_revisions
          (page_id, version, title, content, summary, tags, changed_by, change_reason)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        revisionStmt.run(
          wiki_page_id,
          currentPage.version,
          currentPage.title,
          currentPage.content,
          currentPage.summary,
          currentPage.tags,
          'productmanager', // Default changer
          change_reason || 'Updated page content'
        );

        // Update page
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (title !== undefined) {
          updateFields.push('title = ?');
          updateValues.push(title);
        }
        if (content !== undefined) {
          updateFields.push('content = ?');
          updateValues.push(content);
        }
        if (summary !== undefined) {
          updateFields.push('summary = ?');
          updateValues.push(summary);
        }
        if (tags !== undefined) {
          updateFields.push('tags = ?');
          updateValues.push(JSON.stringify(tags));
        }
        if (category !== undefined) {
          updateFields.push('category = ?');
          updateValues.push(category);
        }
        if (assigned_to !== undefined) {
          updateFields.push('assigned_to = ?');
          updateValues.push(assigned_to);
        }

        if (updateFields.length > 0) {
          updateFields.push('version = version + 1');
          updateFields.push('updated_at = CURRENT_TIMESTAMP');

          const updateStmt = database.prepare(`
            UPDATE wiki_pages
            SET ${updateFields.join(', ')}
            WHERE id = ?
          `);
          updateValues.push(wiki_page_id);
          updateStmt.run(...updateValues);
        }

        const output = {
          success: true,
          wiki_page_id,
          new_version: currentPage.version + 1
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error updating wiki page: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// Tool: List Wiki Pages
export function registerListWikiPages(server: any) {
  server.registerTool(
    'list_wiki_pages',
    {
      title: 'List Wiki Pages',
      description: 'List wiki pages with optional filtering by category, status, tags, or linked entities',
      inputSchema: {
        status: z.enum(['Draft', 'Published', 'Archived']).optional(),
        category: z.enum(['technical', 'process', 'business', 'qa', 'knowledge']).optional(),
        tags: z.array(z.string()).optional(),
        linked_entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']).optional(),
        linked_entity_id: z.number().optional(),
        limit: z.number().default(50)
      },
      outputSchema: {
        data: z.array(z.object({
          id: z.number(),
          title: z.string(),
          slug: z.string(),
          summary: z.string().nullable(),
          category: z.string().nullable(),
          tags: z.array(z.string()),
          status: z.string(),
          version: z.number(),
          created_by: z.string(),
          current_owner: z.string(),
          assigned_to: z.string().nullable(),
          created_at: z.string(),
          updated_at: z.string(),
          comment_count: z.number()
        })),
        total_count: z.number(),
        filtered_count: z.number()
      }
    },
    async ({ status, category, tags, linked_entity_type, linked_entity_id, limit = 50 }) => {
      try {
        const database = getDatabase();

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

        if (tags && tags.length > 0) {
          const tagConditions = tags.map(() => 'wp.tags LIKE ?').join(' OR ');
          conditions.push(`(${tagConditions})`);
          tags.forEach((tag: string) => params.push(`%${tag}%`));
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
        params.push(limit);

        const stmt = database.prepare(query);
        const pages = stmt.all(...params);

        // Parse tags JSON
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

        const output = {
          data: pages,
          total_count: pages.length,
          filtered_count: pages.length
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error listing wiki pages: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// Tool: Get Wiki Page
export function registerGetWikiPage(server: any) {
  server.registerTool(
    'get_wiki_page',
    {
      title: 'Get Wiki Page',
      description: 'Get a wiki page by ID or slug with full content and metadata',
      inputSchema: {
        wiki_page_id: z.number().optional(),
        slug: z.string().optional()
      },
      outputSchema: {
        id: z.number(),
        title: z.string(),
        slug: z.string(),
        content: z.string(),
        summary: z.string().nullable(),
        category: z.string().nullable(),
        tags: z.array(z.string()),
        status: z.string(),
        version: z.number(),
        created_by: z.string(),
        current_owner: z.string(),
        assigned_to: z.string().nullable(),
        created_at: z.string(),
        updated_at: z.string(),
        comment_count: z.number(),
        linked_entities: z.array(z.object({
          entity_type: z.string(),
          entity_id: z.number(),
          link_type: z.string()
        }))
      }
    },
    async ({ wiki_page_id, slug }) => {
      try {
        const database = getDatabase();

        let page;
        if (wiki_page_id) {
          page = database.prepare('SELECT * FROM wiki_pages WHERE id = ?').get(wiki_page_id);
        } else if (slug) {
          page = database.prepare('SELECT * FROM wiki_pages WHERE slug = ?').get(slug);
        } else {
          return {
            content: [{ type: 'text', text: 'Either wiki_page_id or slug must be provided' }],
            isError: true
          };
        }

        if (!page) {
          return {
            content: [{ type: 'text', text: 'Wiki page not found' }],
            isError: true
          };
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

        return {
          content: [{ type: 'text', text: JSON.stringify(page, null, 2) }],
          structuredContent: page
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error getting wiki page: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// Tool: Manage Wiki Links
export function registerManageWikiLinks(server: any) {
  server.registerTool(
    'manage_wiki_links',
    {
      title: 'Manage Wiki Links',
      description: 'Add or remove links between wiki pages and SDLC entities',
      inputSchema: {
        wiki_page_id: z.number(),
        action: z.enum(['add', 'remove']),
        links: z.array(z.object({
          entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
          entity_id: z.number(),
          link_type: z.enum(['related', 'documentation', 'requirements', 'design', 'testing']).default('related')
        }))
      },
      outputSchema: {
        success: z.boolean(),
        wiki_page_id: z.number(),
        added_links: z.array(z.object({
          entity_type: z.string(),
          entity_id: z.number(),
          link_type: z.string()
        })),
        removed_links: z.array(z.object({
          entity_type: z.string(),
          entity_id: z.number(),
          link_type: z.string()
        }))
      }
    },
    async ({ wiki_page_id, action, links }) => {
      try {
        const database = getDatabase();

        // Verify wiki page exists
        const page = database.prepare('SELECT id FROM wiki_pages WHERE id = ?').get(wiki_page_id);
        if (!page) {
          return {
            content: [{ type: 'text', text: 'Wiki page not found' }],
            isError: true
          };
        }

        const added_links: any[] = [];
        const removed_links: any[] = [];

        // Process each link
        for (const link of links) {
          const { entity_type, entity_id, link_type } = link;

          // Verify entity exists
          const entityTable = {
            epic: 'epics',
            user_story: 'user_stories',
            task: 'tasks',
            bug: 'bugs',
            test_case: 'test_cases'
          }[entity_type];

          const entity = database.prepare(`SELECT id FROM ${entityTable} WHERE id = ?`).get(entity_id);
          if (!entity) {
            continue; // Skip invalid entities
          }

          if (action === 'add') {
            // Add link (ignore if already exists)
            database.prepare(`
              INSERT OR IGNORE INTO wiki_page_links
              (wiki_page_id, entity_type, entity_id, link_type, created_by)
              VALUES (?, ?, ?, ?, ?)
            `).run(wiki_page_id, entity_type, entity_id, link_type, 'productmanager');
            added_links.push({ entity_type, entity_id, link_type });
          } else if (action === 'remove') {
            // Remove link
            const result = database.prepare(`
              DELETE FROM wiki_page_links
              WHERE wiki_page_id = ? AND entity_type = ? AND entity_id = ?
            `).run(wiki_page_id, entity_type, entity_id);

            if (result.changes > 0) {
              removed_links.push({ entity_type, entity_id, link_type });
            }
          }
        }

        const output = {
          success: true,
          wiki_page_id,
          added_links,
          removed_links
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error managing wiki links: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}

// Register all wiki tools
export function registerAllWikiTools(server: any) {
  registerCreateWikiPage(server);
  registerUpdateWikiPage(server);
  registerListWikiPages(server);
  registerGetWikiPage(server);
  registerManageWikiLinks(server);
}