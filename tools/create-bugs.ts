import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * Create Bugs Tool
 * Creates multiple bug reports in the SDLC tracker
 */
export function registerCreateBugs(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'create_bugs',
    {
      title: 'Create Bugs',
      description: 'Create multiple bug reports in the SDLC tracker',
      inputSchema: {
        bugs: z.array(z.object({
          user_story_id: z.number(),
          task_id: z.number().optional(),
          title: z.string().min(1),
          description: z.string().optional(),
          severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
          reported_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']),
          assigned_to: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']).optional(),
          phase: z.string().optional(),
          phase_status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked', 'Open', 'Fixed', 'Closed']).optional()
        })).min(1)
      },
      outputSchema: {
        results: z.array(z.object({
          success: z.boolean(),
          bug_id: z.number().optional(),
          error: z.string().optional()
        }))
      }
    },
    async ({ bugs }) => {
      try {
        const database = getDatabase();
        const results: { success: boolean; bug_id?: number; error?: string }[] = [];

        for (const bug of bugs) {
          try {
            // Validate foreign keys if provided
            if (bug.user_story_id) {
              const storyExists = database.prepare('SELECT id FROM user_stories WHERE id = ?').get(bug.user_story_id);
              if (!storyExists) {
                results.push({
                  success: false,
                  error: `User story with ID ${bug.user_story_id} does not exist`
                });
                continue;
              }
            }

            if (bug.task_id) {
              const taskExists = database.prepare('SELECT id FROM tasks WHERE id = ?').get(bug.task_id);
              if (!taskExists) {
                results.push({
                  success: false,
                  error: `Task with ID ${bug.task_id} does not exist`
                });
                continue;
              }
            }

            const stmt = database.prepare(`
              INSERT INTO bugs (user_story_id, task_id, title, description, severity, reported_by, assigned_to, created_by, current_owner, phase, phase_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
              bug.user_story_id || null,
              bug.task_id || null,
              bug.title,
              bug.description || null,
              bug.severity,
              bug.reported_by,
              bug.assigned_to || null,
              bug.reported_by, // created_by defaults to reporter
              bug.assigned_to || bug.reported_by, // current_owner defaults to assigned_to or reporter
              bug.phase || null,
              bug.phase_status || null
            );

            results.push({
              success: true,
              bug_id: result.lastInsertRowid as number
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
          content: [{ type: 'text', text: `Error creating bugs: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}