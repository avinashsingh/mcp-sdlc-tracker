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
           description: z.string().min(1),
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

            // Check if story status needs to be updated from Closed to QA
            if (bug.user_story_id) {
              const storyInfo = database.prepare('SELECT status, epic_id FROM user_stories WHERE id = ?').get(bug.user_story_id);
              if (storyInfo?.status === 'Closed') {
                // Update both story and potentially epic status in transaction
                const updateTransaction = database.transaction(() => {
                  // Update story status to QA
                  database.prepare('UPDATE user_stories SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run('QA', bug.user_story_id);

                  // Record story status transition
                  database.prepare(`
                    INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, transitioned_by)
                    VALUES (?, ?, ?, ?, ?)
                  `).run('user_story', bug.user_story_id, 'Closed', 'QA', bug.reported_by);

                  // Check and update epic if needed
                  if (storyInfo.epic_id) {
                    const epicStatus = database.prepare('SELECT status FROM epics WHERE id = ?').get(storyInfo.epic_id);
                    if (epicStatus?.status === 'Closed') {
                      database.prepare('UPDATE epics SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                        .run('Open', storyInfo.epic_id);

                      // Record epic status transition
                      database.prepare(`
                        INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, transitioned_by)
                        VALUES (?, ?, ?, ?, ?)
                      `).run('epic', storyInfo.epic_id, 'Closed', 'Open', bug.reported_by);
                    }
                  }
                });
                updateTransaction();
              }
            }

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