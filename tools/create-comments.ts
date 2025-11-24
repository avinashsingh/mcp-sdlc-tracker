import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * Create Comments Tool
 * Creates comments on SDLC entities for stakeholder feedback
 */
export function registerCreateComments(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'create_comments',
    {
      title: 'Create Comments',
      description: 'Create comments on SDLC entities for stakeholder feedback',
      inputSchema: {
        comments: z.array(z.object({
          entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
          entity_id: z.number(),
          comment_text: z.string().min(1),
          author: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect'])
        })).min(1)
      },
      outputSchema: {
        results: z.array(z.object({
          success: z.boolean(),
          comment_id: z.number().optional(),
          error: z.string().optional()
        }))
      }
    },
    async ({ comments }) => {
      try {
        const database = getDatabase();
        const results = [];

        for (const comment of comments) {
          try {
            // Validate entity exists
            const entityTable = {
              epic: 'epics',
              user_story: 'user_stories',
              task: 'tasks',
              bug: 'bugs',
              test_case: 'test_cases'
            };

            const tableName = entityTable[comment.entity_type];
            const entityExists = database.prepare(`SELECT id FROM ${tableName} WHERE id = ?`).get(comment.entity_id);

            if (!entityExists) {
              results.push({
                success: false,
                error: `${comment.entity_type} with ID ${comment.entity_id} does not exist`
              });
              continue;
            }

            const stmt = database.prepare(`
              INSERT INTO comments (entity_type, entity_id, comment_text, author)
              VALUES (?, ?, ?, ?)
            `);

            const result = stmt.run(
              comment.entity_type,
              comment.entity_id,
              comment.comment_text,
              comment.author
            );

            results.push({
              success: true,
              comment_id: result.lastInsertRowid as number
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
          content: [{ type: 'text', text: `Error creating comments: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}