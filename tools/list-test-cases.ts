import { z } from 'zod';
import Database from 'better-sqlite3';

/**
 * List Test Cases Tool
 * Lists test cases with optional filtering by user story, status, and assignee
 */
export function registerListTestCases(server: any, getDatabase: () => Database.Database) {
  server.registerTool(
    'list_test_cases',
    {
      title: 'List Test Cases',
      description: 'List test cases with optional filtering by user story, status, assignee',
      inputSchema: {
        user_story_id: z.number().optional(),
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
    async ({ user_story_id, status, assigned_to, limit = 50 }) => {
      try {
        const database = getDatabase();

        let query = 'SELECT * FROM test_cases WHERE 1=1';
        const params: any[] = [];

        if (user_story_id) {
          query += ' AND user_story_id = ?';
          params.push(user_story_id);
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

        const stmt = database.prepare(query);
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
}