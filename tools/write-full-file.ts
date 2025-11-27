import { z } from 'zod';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path from 'path';

/**
 * Write Full File Tool
 * Writes content to a file after creating a backup and validating line count
 */
export function registerWriteFullFile(server: any) {
  server.registerTool(
    'write_full_file',
    {
      title: 'Write Full File',
      description: 'Writes file at given location, takes backup of original file in .bummer/ folder, validates max 400 lines',
      inputSchema: {
        file_path: z.string().min(1, 'File path is required'),
        body: z.string().min(1, 'File content is required')
      },
      outputSchema: {
        // Success: structuredContent with { success: boolean, backup_location: string }
        // Error: content with [{ type: 'text', text: string }] and isError: boolean
        success: z.boolean().optional(),
        backup_location: z.string().optional(),
        error: z.string().optional()
      }
    },
    async ({ file_path, body }) => {
      try {
        // Check line count - throw error if more than 400 lines
        const lines = body.split('\n');
        if (lines.length > 400) {
          return {
            content: [{ 
              type: 'text', 
              text: `Max lines allowed in a file is 400, your file has ${lines.length} lines. Please split your logic.` 
            }],
            isError: true
          };
        }

        // Get project root path (assuming current working directory is project root)
        const projectRoot = process.cwd();
        const bummerDir = path.join(projectRoot, '.bummer');
        
        // Create .bummer directory if it doesn't exist
        if (!existsSync(bummerDir)) {
          mkdirSync(bummerDir, { recursive: true });
        }

        // Generate backup filename by converting path to folder-file format
        // Replace / with - and remove leading slash if present
        const relativePath = path.isAbsolute(file_path) 
          ? path.relative(projectRoot, file_path)
          : file_path;
        const backupFileName = relativePath.replace(/[\/\\]/g, '-');
        const backupPath = path.join(bummerDir, backupFileName);

        // Create backup if original file exists
        if (existsSync(file_path)) {
          const originalContent = readFileSync(file_path, 'utf8');
          writeFileSync(backupPath, originalContent, 'utf8');
        }

        // Write new content to file
        // Ensure directory exists for the target file
        const targetDir = path.dirname(file_path);
        if (!existsSync(targetDir)) {
          mkdirSync(targetDir, { recursive: true });
        }
        
        writeFileSync(file_path, body, 'utf8');

        const backupLocation = existsSync(backupPath) ? backupPath : 'No backup created (new file)';
        
        return {
          content: [{ type: 'text', text: `File written successfully. Backup location: ${backupLocation}` }],
          structuredContent: {
            success: true,
            backup_location: backupLocation
          }
        };
      } catch (error) {
        return {
          content: [{ 
            type: 'text', 
            text: `Error writing file: ${error instanceof Error ? error.message : String(error)}` 
          }],
          isError: true
        };
      }
    }
  );
}