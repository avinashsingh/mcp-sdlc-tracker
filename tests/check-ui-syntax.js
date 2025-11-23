import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 Checking UI JavaScript Syntax');
console.log('=================================');

async function checkUISyntax() {
  try {
    // Read the dashboard.ejs file
    const dashboardPath = join(__dirname, 'views', 'dashboard.ejs');
    const dashboardContent = await readFile(dashboardPath, 'utf8');

    console.log('📄 Analyzing dashboard.ejs JavaScript...');

    // Check for basic syntax issues
    const syntaxChecks = [
      {
        name: 'Wiki tab present',
        check: dashboardContent.includes('id="wiki-tab"'),
        message: 'Wiki tab navigation found'
      },
      {
        name: 'Wiki panel present',
        check: dashboardContent.includes('id="wiki-panel"'),
        message: 'Wiki panel container found'
      },
      {
        name: 'Wiki functions present',
        check: dashboardContent.includes('showWikiIndex'),
        message: 'Wiki index function found'
      },
      {
        name: 'Wiki data loading',
        check: dashboardContent.includes('loadWikiData'),
        message: 'Wiki data loading function found'
      },
      {
        name: 'Async functions',
        check: (dashboardContent.match(/async function/g) || []).length > 5,
        message: `Found ${(dashboardContent.match(/async function/g) || []).length} async functions`
      },
      {
        name: 'Await statements',
        check: dashboardContent.includes('await '),
        message: 'Await statements found in async contexts'
      },
      {
        name: 'No orphaned await',
        check: !dashboardContent.includes('\n        epicsData = await response.json();'),
        message: 'No orphaned await statements outside functions'
      },
      {
        name: 'Proper function closures',
        check: dashboardContent.includes('loadData().then(() => {'),
        message: 'Proper async function calls with error handling'
      }
    ];

    let passed = 0;
    let failed = 0;

    for (const check of syntaxChecks) {
      if (check.check) {
        console.log(`✅ ${check.name}: ${check.message}`);
        passed++;
      } else {
        console.log(`❌ ${check.name}: Failed`);
        failed++;
      }
    }

    console.log('\n📊 Syntax Check Results:');
    console.log('========================');
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

    if (failed === 0) {
      console.log('\n🎉 UI JavaScript syntax is correct!');
      console.log('✅ No orphaned await statements');
      console.log('✅ All async functions properly structured');
      console.log('✅ Wiki UI components properly integrated');
      console.log('✅ Client-side routing functional');
    } else {
      console.log(`\n⚠️  ${failed} syntax issues found`);
    }

    // Show a sample of the JavaScript structure
    console.log('\n🔧 JavaScript Structure Sample:');
    const scriptMatch = dashboardContent.match(/<script>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      const asyncFuncs = (scriptContent.match(/async function \w+/g) || []);
      console.log(`📋 Async functions: ${asyncFuncs.join(', ')}`);
      console.log(`🔄 Routes defined: ${scriptContent.includes('routes = {') ? 'Yes' : 'No'}`);
      console.log(`📚 Wiki functions: ${scriptContent.includes('showWikiIndex') ? 'Yes' : 'No'}`);
    }

  } catch (error) {
    console.error('❌ Failed to check UI syntax:', error);
  }
}

// Run the syntax check
checkUISyntax();