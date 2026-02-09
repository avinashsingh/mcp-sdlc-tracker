import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * Create Test Cases Tool
 * Creates multiple test cases linked to user stories
 */
export function registerCreateTestCases(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'create_test_cases',
    {
      title: 'Create Test Cases',
      description: 'Create multiple test cases in the SDLC tracker',
      inputSchema: {
        test_cases: z.array(z.object({
          user_story_id: z.number(),
          title: z.string().min(1),
          description: z.string().optional(),
          preconditions: z.string().optional(),
          steps: z.string().min(1),
          expected_result: z.string().min(1),
          assigned_to: z.enum(['tester', 'productmanager']).optional(),
          phase: z.string().optional(),
          phase_status: z.enum(['Not Started', 'In Progress', 'Completed', 'Blocked']).optional()
        })).min(1)
      },
      outputSchema: {
        results: z.array(z.object({
          success: z.boolean(),
          test_case_id: z.number().optional(),
          error: z.string().optional()
        }))
      }
    },
    async ({ test_cases }) => {
      try {
        const database = getDatabase();
        const results = [];

        for (const testCase of test_cases) {
          try {
            // Validate foreign key - user_story_id is now required
            const storyExists = database.prepare('SELECT id FROM user_stories WHERE id = ?').get(testCase.user_story_id);
            if (!storyExists) {
              results.push({
                success: false,
                error: `User story with ID ${testCase.user_story_id} does not exist`
              });
              continue;
            }

            const stmt = database.prepare(`
              INSERT INTO test_cases (user_story_id, title, description, preconditions, steps, expected_result, assigned_to, phase, phase_status, created_by, current_owner)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            const result = stmt.run(
              testCase.user_story_id,
              testCase.title,
              testCase.description || null,
              testCase.preconditions || null,
              testCase.steps,
              testCase.expected_result,
              testCase.assigned_to || null,
              testCase.phase || null,
              testCase.phase_status || null,
              'tester', // Default creator
              testCase.assigned_to || 'tester' // Default owner
            );

            results.push({
              success: true,
              test_case_id: result.lastInsertRowid as number
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
          content: [{ type: 'text', text: `Error creating test cases: ${error.message}` }],
          isError: true,
          structuredContent: {
            results: [{
              success: false,
              error: error.message
            }]
          }
        };
      }
    }
  );
}