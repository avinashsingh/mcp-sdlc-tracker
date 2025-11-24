import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as os from 'os';

// Note: projectPath is managed in server.ts
declare const projectPath: string | null;
declare const isInitialized: boolean;

function generateTree(dir: string, prefix = ''): string {
  let result = '';
  const excludes = ['__pycache__', 'venv', 'env', 'build', 'dist', 'test', 'tests', '.git', 'analysis', '.mypy_cache', '.pytest_cache',
                    'node_modules', 'dist', '.next', '.nuxt', 'coverage', '.nyc_output',
                    'target', 'build', 'bin', 'out', '.gradle', '.mvn'];
  const items = fs.readdirSync(dir).filter(item => !excludes.includes(item));
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const fullPath = path.join(dir, item);
    const stats = fs.statSync(fullPath);
    result += prefix + (isLast ? '└── ' : '├── ') + item + '\n';
    if (stats.isDirectory()) {
      result += generateTree(fullPath, prefix + (isLast ? '    ' : '│   '));
    }
  });
  return result;
}

function parseFile(file: string, content: string) {
  const ext = path.extname(file);
  let imports: string[] = [];
  let classes: string[] = [];
  let functions: string[] = [];
  let calls: string[] = [];

  if (['.js', '.ts', '.jsx', '.tsx'].includes(ext)) {
    // Node.js parsing
    imports = [
      ...content.matchAll(/import\s+.*?\s+from\s+['"]([^'"]+)['"]/g),
      ...content.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
    ].map(m => m[1]);
    classes = [...content.matchAll(/\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)].map(m => m[1]);
    functions = [
      ...content.matchAll(/\bfunction\s+([A-Za-z_$][A-Za-z0-9_$]*)/g),
      ...content.matchAll(/\bconst\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)\s*=>|function)/g),
      ...content.matchAll(/\bexport\s+(?:const\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:\([^)]*\)\s*=>|function)/g)
    ].map(m => m[1]);
    calls = [...new Set([...content.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)].map(m => m[1]))];
  } else if (ext === '.py') {
    // Python parsing
    imports = [...content.matchAll(/^(import|from)\s+([^ \n]+)/gm)].map(m => m[2]);
    classes = [...content.matchAll(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map(m => m[1]);
    functions = [...content.matchAll(/^def\s+([A-Za-z_][A-Za-z0-9_]*)/gm)].map(m => m[1]);
    calls = [...new Set([...content.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\([^\)]*\)/g)].map(m => m[1]))];
  } else if (ext === '.java') {
    // Java parsing
    imports = [...content.matchAll(/^import\s+([^;]+);/gm)].map(m => m[1].trim());
    classes = [...content.matchAll(/\b(?:public|private|protected)?\s*class\s+([A-Za-z_$][A-Za-z0-9_$]*)/g)].map(m => m[1]);
    functions = [...content.matchAll(/\b(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)].map(m => m[1]);
    calls = [...new Set([...content.matchAll(/([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g)].map(m => m[1]))];
  }

  return {
    f: file,
    i: imports.length ? imports : undefined,
    c: classes.length ? classes : undefined,
    fn: functions.length ? functions : undefined,
    ca: calls.length ? calls : undefined
  };
}

function generateKnowledgeGraph(rootPath: string): any {
  const tmpdir = os.tmpdir() + '/kg_' + Date.now();
  fs.mkdirSync(tmpdir, { recursive: true });

  const treefile = path.join(tmpdir, 'tree.txt');
  const filesfile = path.join(tmpdir, 'files.jsonl');

  // Generate tree
  const tree = generateTree(rootPath);
  fs.writeFileSync(treefile, tree);

  // Find all supported files, excluding build dirs
  const findCmd = `find . -type f \\( -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.py" -o -name "*.java" \\) ! -path "./venv/*" ! -path "./env/*" ! -path "./__pycache__/*" ! -path "./build/*" ! -path "./dist/*" ! -path "*/test/*" ! -path "*/tests/*" ! -path "./node_modules/*" ! -path "./target/*" ! -path "./bin/*" ! -path "./out/*" ! -path "./.gradle/*" ! -path "./.mvn/*" ! -path "./.next/*" ! -path "./.nuxt/*" ! -path "./coverage/*" ! -path "./.nyc_output/*" ! -path "./analysis/*"`;
  const files = execSync(findCmd, { encoding: 'utf8', cwd: rootPath }).trim().split('\n').filter(f => f);

  const fileData = files.map(file => {
    const fullPath = path.join(rootPath, file);
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).size === 0) return null;
    const content = fs.readFileSync(fullPath, 'utf8');
    return parseFile(file, content);
  }).filter(Boolean);

  // Write files.jsonl
  fs.writeFileSync(filesfile, fileData.map(d => JSON.stringify(d)).join('\n'));

  // Combine into result
  const filesJson = fileData;
  const result = { t: tree, f: filesJson };

  // Cleanup
  fs.rmSync(tmpdir, { recursive: true, force: true });

  return result;
}

export function get_knowledge_graph(rootPath?: string): any {
  let pathToUse: string;
  if (rootPath) {
    // Test mode or direct call
    pathToUse = rootPath;
  } else {
    // Production mode
    if (typeof isInitialized === 'undefined' || !isInitialized || !projectPath) {
      throw new Error('Database not initialized. Please call the initialize tool first.');
    }
    pathToUse = projectPath;
  }

  // Generate knowledge graph at runtime
  return generateKnowledgeGraph(pathToUse);
}

/**
 * Get Knowledge Graph Tool
 * Retrieves the knowledge graph for the initialized project (creates it if it doesn't exist)
 */
export function registerGetKnowledgeGraph(server: any) {
  server.registerTool(
    'get_knowledge_graph',
    {
      title: 'Get Knowledge Graph',
      description: 'Retrieve the knowledge graph for the initialized project, creating it if it doesn\'t exist',
      inputSchema: {},
      outputSchema: {
        t: z.string(),
        f: z.array(z.object({
          f: z.string(),
          i: z.array(z.string()).optional(),
          c: z.array(z.string()).optional(),
          fn: z.array(z.string()).optional(),
          ca: z.array(z.string()).optional()
        }))
      }
    },
    async () => {
      try {
        const kg = get_knowledge_graph();

        return {
          content: [{ type: 'text', text: JSON.stringify(kg, null, 2) }],
          structuredContent: kg
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `Error getting knowledge graph: ${error.message}` }],
          isError: true
        };
      }
    }
  );
}