import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * Get Comments Tool
 * Retrieves comments for a specific SDLC entity
 */
export function registerGetComments(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'get_comments',
    {
      title: 'Get Comments',
      description: 'Get comments for a specific SDLC entity',
      inputSchema: {
        entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
        entity_id: z.number(),
        limit: z.number().default(50)
      },
      outputSchema: {
        comments: z.array(z.object({
          id: z.number(),
          entity_type: z.string(),
          entity_id: z.number(),
          comment_text: z.string(),
          author: z.string(),
          created_at: z.string(),
          updated_at: z.string()
        })),
        total_count: z.number()
      }
    },
    async ({ entity_type, entity_id, limit = 50 }) => {
      try {
        const database = getDatabase();

        // Validate entity exists
        const entityTable = {
          epic: 'epics',
          user_story: 'user_stories',
          task: 'tasks',
          bug: 'bugs',
          test_case: 'test_cases'
        };

        const tableName = entityTable[entity_type];
        const entityExists = database.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(entity_id);

        if (!entityExists) {
          return {
            content: [{ type: 'text', text: `${entity_type} with ID ${entity_id} does not exist` }],
            isError: true
          };
        }

        const stmt = database.prepare(`
          SELECT id, entity_type, entity_id, comment_text, author, created_at, updated_at
          FROM comments
          WHERE entity_type = ? AND entity_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        `);

        const comments = stmt.all(entity_type, entity_id, limit);

        const totalCount = database.prepare(`
          SELECT COUNT(*) as count
          FROM comments
          WHERE entity_type = ? AND entity_id = ?
        `).get(entity_type, entity_id).count;

        return {
          content: [{ type: 'text', text: JSON.stringify({ comments, total_count: totalCount }, null, 2) }],
          structuredContent: { comments, total_count: totalCount }
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error getting comments: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}