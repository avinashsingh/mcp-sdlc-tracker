import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * List Bugs Tool
 * Lists bugs with optional filtering by status, severity, reporter, assignee
 */
export function registerListBugs(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'list_bugs',
    {
      title: 'List Bugs',
      description: 'List bugs with optional filtering by status, severity, reporter, assignee',
      inputSchema: {
        bug_id: z.number().optional(),
        user_story_id: z.number().optional(),
        status: z.enum(['Open', 'In Progress', 'Review', 'Fixed', 'Closed']).optional(),
        severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
        reported_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
        assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
        limit: z.number().default(50)
      },
      outputSchema: {
        data: z.array(z.object({
          id: z.number(),
          user_story_id: z.number().nullable(),
          task_id: z.number().nullable(),
          title: z.string(),
          description: z.string().nullable(),
          severity: z.string(),
          status: z.string(),
          reported_by: z.string(),
          assigned_to: z.string().nullable(),
          created_by: z.string(),
          current_owner: z.string().nullable(),
          phase: z.string().nullable(),
          phase_status: z.string().nullable(),
          created_at: z.string(),
          updated_at: z.string(),
          fixed_at: z.string().nullable(),
          closed_at: z.string().nullable(),
          comment_count: z.number(),
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
    async ({ bug_id, user_story_id, status, severity, reported_by, assigned_to, limit = 50 }) => {
      try {
        const database = getDatabase();

        let query = `SELECT * FROM bugs`;
        const conditions = [];
        const params = [];

        if (bug_id) {
          conditions.push('id = ?');
          params.push(bug_id);
        }

        if (status) {
          conditions.push('status = ?');
          params.push(status);
        }

        if (severity) {
          conditions.push('severity = ?');
          params.push(severity);
        }

        if (reported_by) {
          conditions.push('reported_by = ?');
          params.push(reported_by);
        }

        if (assigned_to) {
          conditions.push('assigned_to = ?');
          params.push(assigned_to);
        }

        if (user_story_id) {
          conditions.push('user_story_id = ?');
          params.push(user_story_id);
        }

        if (conditions.length > 0) {
          query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ` ORDER BY created_at DESC LIMIT ?`;
        params.push(limit);

        const stmt = database.prepare(query);
        const bugs = stmt.all(...params);

        // Add comment count and wiki links to each bug
        for (const bug of bugs) {
          bug.comment_count = database.prepare(`
            SELECT COUNT(*) as count FROM comments WHERE entity_type = 'bug' AND entity_id = ?
          `).get(bug.id).count;

          // Get linked wiki pages
          const wikiLinkRows = database.prepare(`
            SELECT wpl.wiki_page_id, wp.title, wpl.link_type
            FROM wiki_page_links wpl
            JOIN wiki_pages wp ON wpl.wiki_page_id = wp.id
            WHERE wpl.entity_type = 'bug' AND wpl.entity_id = ?
          `).all(bug.id);
          bug.wiki_links = wikiLinkRows;
        }

        const output = {
          data: bugs,
          total_count: bugs.length,
          filtered_count: bugs.length
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
}