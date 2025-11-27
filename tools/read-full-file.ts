import { z } from 'zod';
import { existsSync, readFileSync } from 'fs';

/**
 * Read Full File Tool
 * Reads the full content of a file and returns it
 */
export function registerReadFullFile(server: any) {
  server.registerTool(
    'read_full_file',
    {
      title: 'Read Full File',
      description: 'Reads the full file content and responds, throws error if file does not exist',
      inputSchema: {
        file_path: z.string().min(1, 'File path is required')
      },
      outputSchema: {
        // Success: structuredContent with { success: boolean, content: string }
        // Error: content with [{ type: 'text', text: string }] and isError: boolean
        success: z.boolean().optional(),
        content: z.string().optional(),
        error: z.string().optional()
      }
    },
    async ({ file_path }) => {
      try {
        // Check if file exists
        if (!existsSync(file_path)) {
          return {
            content: [{ 
              type: 'text', 
              text: `File does not exist: ${file_path}` 
            }],
            isError: true
          };
        }

        // Read file content
        const content = readFileSync(file_path, 'utf8');
        
        return {
          content: [{ type: 'text', text: content }],
          structuredContent: {
            success: true,
            content
          }
        };
      } catch (error) {
        return {
          content: [{ 
            type: 'text', 
            text: `Error reading file: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true
        };
      }
    }
  );
}