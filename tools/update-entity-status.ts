import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * Update Entity Status Tool
 * Updates status and/or assignment of any SDLC entity with audit trail and workflow suggestions
 */
export function registerUpdateEntityStatus(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'update_entity_status',
    {
      title: 'Update Entity Status and Assignment',
      description: 'Update the status and/or assignment of any SDLC entity (epic, user_story, task, bug, test_case) with audit trail recording and intelligent workflow suggestions',
      inputSchema: {
        entity_type: z.enum(['epic', 'user_story', 'task', 'bug', 'test_case']),
        entity_id: z.number(),
        status: z.string().optional(),
        assigned_to: z.string().optional(),
        transitioned_by: z.enum(['productmanager', 'programmanager', 'developer', 'tester', 'architect']),
        phase: z.string().optional(),
        phase_status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked', 'Open', 'Fixed', 'Closed']).optional(),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        estimated_hours: z.number().optional()
      },
      outputSchema: {
        success: z.boolean(),
        entity_type: z.string(),
        entity_id: z.number(),
        old_status: z.string().nullable(),
        new_status: z.string().nullable(),
        old_assigned_to: z.string().nullable(),
        new_assigned_to: z.string().nullable(),
        transitioned_by: z.string(),
        error: z.string().optional(),
        workflow_suggestions: z.array(z.object({
          entity_type: z.string(),
          entity_id: z.number(),
          suggested_action: z.string(),
          reason: z.string(),
          suggested_status: z.string()
        })).optional()
      }
    },
    async ({ entity_type, entity_id, status, assigned_to, transitioned_by, phase, phase_status, priority, title, description, estimated_hours }) => {
      try {
        const database = getDatabase();

        const entityTable = {
          epic: 'epics',
          user_story: 'user_stories',
          task: 'tasks',
          bug: 'bugs',
          test_case: 'test_cases'
        }[entity_type];

        // Get current entity state
        const currentEntity = database.prepare(`SELECT * FROM ${entityTable} WHERE id = ?`).get(entity_id);
        if (!currentEntity) {
          return {
            content: [{ type: 'text', text: `${entity_type} with ID ${entity_id} does not exist` }],
            structuredContent: {
              success: false,
              entity_type,
              entity_id,
              error: `${entity_type} with ID ${entity_id} does not exist`
            },
            isError: true
          };
        }

        // Validate status transitions and business rules
        if (status) {
          // Epic validation
          if (entity_type === 'epic' && status === 'Closed') {
            const openStories = database.prepare(`
              SELECT COUNT(*) as count FROM user_stories
              WHERE epic_id = ? AND status != 'Closed'
            `).get(entity_id);

            if (openStories.count > 0) {
              return {
                content: [{ type: 'text', text: `Cannot close epic: ${openStories.count} user stories are not closed` }],
                structuredContent: {
                  success: false,
                  entity_type,
                  entity_id,
                  error: `Cannot close epic: ${openStories.count} user stories are not closed`
                },
                isError: true
              };
            }
          }

          // User story validation
          if (entity_type === 'user_story') {
            if (status === 'In Progress') {
              // Check if acceptance criteria exist
              if (!currentEntity.acceptance_criteria) {
                return {
                  content: [{ type: 'text', text: 'Cannot move user story to In Progress: acceptance criteria required' }],
                  structuredContent: {
                    success: false,
                    entity_type,
                    entity_id,
                    error: 'Cannot move user story to In Progress: acceptance criteria required'
                  },
                  isError: true
                };
              }

              // Check if test cases exist
              const testCaseCount = database.prepare(`
                SELECT COUNT(*) as count FROM test_cases WHERE user_story_id = ?
              `).get(entity_id).count;

              if (testCaseCount === 0) {
                return {
                  content: [{ type: 'text', text: 'Cannot move user story to In Progress: test cases required' }],
                  structuredContent: {
                    success: false,
                    entity_type,
                    entity_id,
                    error: 'Cannot move user story to In Progress: test cases required'
                  },
                  isError: true
                };
              }
            }

            if (status === 'QA') {
              const openTasks = database.prepare(`
                SELECT id FROM tasks
                WHERE user_story_id = ? AND status != 'Closed'
              `).all(entity_id);

              if (openTasks.length > 0) {
                const openTaskIds = openTasks.map(task => task.id);
                return {
                  content: [{ type: 'text', text: `Cannot move user story to QA: ${openTasks.length} tasks are not closed (IDs: ${openTaskIds.join(', ')})` }],
                  structuredContent: {
                    success: false,
                    entity_type,
                    entity_id,
                    error: `Cannot move user story to QA: ${openTasks.length} tasks are not closed`,
                    open_task_ids: openTaskIds
                  },
                  isError: true
                };
              }

              // Check and update epic status if needed when story moves to QA
              const storyInfo = database.prepare('SELECT epic_id FROM user_stories WHERE id = ?').get(entity_id);
              if (storyInfo?.epic_id) {
                const epicStatus = database.prepare('SELECT status FROM epics WHERE id = ?').get(storyInfo.epic_id);
                if (epicStatus?.status === 'Closed') {
                  // Update epic status to 'Open' - this will be included in the main transaction below
                  database.prepare('UPDATE epics SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                    .run('Open', storyInfo.epic_id);

                  // Record epic status transition
                  database.prepare(`
                    INSERT INTO status_transitions (entity_type, entity_id, from_status, to_status, transitioned_by)
                    VALUES (?, ?, ?, ?, ?)
                  `).run('epic', storyInfo.epic_id, 'Closed', 'Open', transitioned_by);
                }
              }
            }

            if (status === 'UAT') {
              const issues: string[] = [];

              // Check 1: All tasks must be closed
              const openTasks = database.prepare(`
                SELECT id FROM tasks
                WHERE user_story_id = ? AND status != 'Closed'
              `).all(entity_id);

              if (openTasks.length > 0) {
                const openTaskIds = openTasks.map(t => t.id);
                issues.push(`${openTasks.length} tasks not closed (IDs: ${openTaskIds.join(', ')})`);
              }

              // Check 2: All bugs must be closed
              const openBugs = database.prepare(`
                SELECT id FROM bugs
                WHERE user_story_id = ? AND status != 'Closed'
              `).all(entity_id);

              if (openBugs.length > 0) {
                const openBugIds = openBugs.map(b => b.id);
                issues.push(`${openBugs.length} bugs not closed (IDs: ${openBugIds.join(', ')})`);
              }

              // Check 3: All test cases must have passed
              const failedTestCases = database.prepare(`
                SELECT id FROM test_cases
                WHERE user_story_id = ? AND status != 'Passed'
              `).all(entity_id);

              if (failedTestCases.length > 0) {
                const failedTestCaseIds = failedTestCases.map(tc => tc.id);
                issues.push(`${failedTestCases.length} test cases not passed (IDs: ${failedTestCaseIds.join(', ')})`);
              }

              if (issues.length > 0) {
                return {
                  content: [{ type: 'text', text: `Cannot move user story to UAT: ${issues.join(', ')}` }],
                  structuredContent: {
                    success: false,
                    entity_type,
                    entity_id,
                    error: `Cannot move user story to UAT: ${issues.join(', ')}`,
                    validation_details: {
                      open_task_ids: openTasks.map(t => t.id),
                      open_bug_ids: openBugs.map(b => b.id),
                      failed_test_case_ids: failedTestCases.map(tc => tc.id)
                    }
                  },
                  isError: true
                };
              }
            }

            if (status === 'Closed') {
              if (currentEntity.status !== 'UAT') {
                return {
                  content: [{ type: 'text', text: 'Cannot move user story to Closed: must come from UAT status' }],
                  structuredContent: {
                    success: false,
                    entity_type,
                    entity_id,
                    error: 'Cannot move user story to Closed: must come from UAT status'
                  },
                  isError: true
                };
              }
              if (transitioned_by !== 'productmanager') {
                return {
                  content: [{ type: 'text', text: 'Only productmanager can close user stories' }],
                  structuredContent: {
                    success: false,
                    entity_type,
                    entity_id,
                    error: 'Only productmanager can close user stories'
                  },
                  isError: true
                };
              }
            }
          }

          // Bug validation
          if (entity_type === 'bug' && status === 'Review' && currentEntity.status !== 'In Progress') {
            return {
              content: [{ type: 'text', text: 'Cannot move bug to Review: must come from In Progress status' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Cannot move bug to Review: must come from In Progress status'
              },
              isError: true
            };
          }
          if (entity_type === 'bug' && status === 'Fixed' && currentEntity.status !== 'Review') {
            return {
              content: [{ type: 'text', text: 'Cannot move bug to Fixed: must come from Review status' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Cannot move bug to Fixed: must come from Review status'
              },
              isError: true
            };
          }
        }

        // Task validation
        if (entity_type === 'task') {
          if (status === 'Prepare' && currentEntity.status !== 'New') {
            return {
              content: [{ type: 'text', text: 'Cannot move task to Prepare: must come from New status' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Cannot move task to Prepare: must come from New status'
              },
              isError: true
            };
          }

          if (status === 'Prepare' && transitioned_by !== 'programmanager') {
            return {
              content: [{ type: 'text', text: 'Only programmanager can move task to Prepare status' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Only programmanager can move task to Prepare status'
              },
              isError: true
            };
          }

          if (status === 'In Progress' && currentEntity.status === 'Prepare' && transitioned_by !== 'architect') {
            return {
              content: [{ type: 'text', text: 'Only architect can move task from Prepare to In Progress' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Only architect can move task from Prepare to In Progress'
              },
              isError: true
            };
          }

          if (status === 'Review' && currentEntity.status === 'In Progress' && transitioned_by !== 'developer') {
            return {
              content: [{ type: 'text', text: 'Only developer can move task from In Progress to Review' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Only developer can move task from In Progress to Review'
              },
              isError: true
            };
          }

          if (status === 'In Progress' && currentEntity.status === 'Review' && transitioned_by !== 'architect') {
            return {
              content: [{ type: 'text', text: 'Only architect can move task from Review to In Progress' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Only architect can move task from Review to In Progress'
              },
              isError: true
            };
          }

          if (status === 'In Progress' && currentEntity.status !== 'Prepare' && currentEntity.status !== 'Review') {
            return {
              content: [{ type: 'text', text: 'Cannot move task to In Progress: must come from Prepare or Review status' }],
              structuredContent: {
                success: false,
                entity_type,
                entity_id,
                error: 'Cannot move task to In Progress: must come from Prepare or Review status'
              },
              isError: true
            };
          }
        }

        // Build update query
        const updateFields: string[] = [];
        const updateValues: any[] = [];

        if (status !== undefined) {
          updateFields.push('status = ?');
          updateValues.push(status);
        }

        if (assigned_to !== undefined) {
          updateFields.push('assigned_to = ?');
          updateValues.push(assigned_to);
          updateFields.push('current_owner = ?');
          updateValues.push(assigned_to);
        }

        if (phase !== undefined) {
          updateFields.push('phase = ?');
          updateValues.push(phase);
        }

        if (phase_status !== undefined) {
          updateFields.push('phase_status = ?');
          updateValues.push(phase_status);
        }

        if (priority !== undefined && entity_type === 'task') {
          updateFields.push('priority = ?');
          updateValues.push(priority);
        }

        if (title !== undefined) {
          updateFields.push('title = ?');
          updateValues.push(title);
        }

        if (description !== undefined) {
          updateFields.push('description = ?');
          updateValues.push(description);
        }

        if (estimated_hours !== undefined && entity_type === 'task') {
          updateFields.push('estimated_hours = ?');
          updateValues.push(estimated_hours);
        }

        if (updateFields.length === 0) {
          return {
            content: [{ type: 'text', text: 'No changes to update' }],
            structuredContent: {
              success: false,
              entity_type,
              entity_id,
              error: 'No changes to update'
            },
            isError: true
          };
        }

        updateFields.push('updated_at = CURRENT_TIMESTAMP');

        // Apply the update in a transaction to ensure atomicity
        const transaction = database.transaction(() => {
          const updateStmt = database.prepare(`
            UPDATE ${entityTable}
            SET ${updateFields.join(', ')}
            WHERE id = ?
          `);
          updateValues.push(entity_id);
          updateStmt.run(...updateValues);

          // Record status transition if status changed
          if (status && currentEntity.status !== status) {
            database.prepare(`
              INSERT INTO status_transitions
              (entity_type, entity_id, from_status, to_status, transitioned_by)
              VALUES (?, ?, ?, ?, ?)
            `).run(entity_type, entity_id, currentEntity.status, status, transitioned_by);
          }

          // Record ownership transition if assigned_to changed
          if (assigned_to !== undefined && currentEntity.assigned_to !== assigned_to) {
            database.prepare(`
              INSERT INTO ownership_transitions
              (entity_type, entity_id, from_owner, to_owner, transitioned_by)
              VALUES (?, ?, ?, ?, ?)
            `).run(entity_type, entity_id, currentEntity.assigned_to, assigned_to, transitioned_by);
          }
        });

        transaction();

        // Check for workflow intelligence when task is closed
        const workflow_suggestions: Array<{entity_type: string, entity_id: number, suggested_action: string, reason: string, suggested_status: string}> = [];
        if (entity_type === 'task' && status === 'Closed') {
          const taskInfo = database.prepare(`
            SELECT user_story_id FROM tasks WHERE id = ?
          `).get(entity_id);

          if (taskInfo?.user_story_id) {
            // Check if all tasks in the user story are closed
            const allTasksResult = database.prepare(`
              SELECT
                COUNT(*) as total_tasks,
                COUNT(CASE WHEN status = 'Closed' THEN 1 END) as closed_tasks
              FROM tasks
              WHERE user_story_id = ?
            `).get(taskInfo.user_story_id);

            if (allTasksResult.total_tasks > 0 &&
                allTasksResult.total_tasks === allTasksResult.closed_tasks) {

              // Check current user story status
              const userStory = database.prepare(`
                SELECT status FROM user_stories WHERE id = ?
              `).get(taskInfo.user_story_id);

              // Only suggest if user story is not already in QA/UAT/Closed
              const advancedStatuses = ['QA', 'UAT', 'Closed'];
              if (!advancedStatuses.includes(userStory.status)) {
                workflow_suggestions.push({
                  entity_type: 'user_story',
                  entity_id: taskInfo.user_story_id,
                  suggested_action: 'move_to_qa',
                  reason: `All ${allTasksResult.total_tasks} tasks in this user story are now closed`,
                  suggested_status: 'QA'
                });
              }
            }
          }
        }

        const output = {
          success: true,
          entity_type,
          entity_id,
          old_status: currentEntity.status,
          new_status: status || currentEntity.status,
          old_assigned_to: currentEntity.assigned_to,
          new_assigned_to: assigned_to !== undefined ? assigned_to : currentEntity.assigned_to,
          transitioned_by,
          workflow_suggestions: workflow_suggestions.length > 0 ? workflow_suggestions : undefined
        };

        return {
          content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error updating entity status: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}
