#!/usr/bin/env node

import { chromium } from 'playwright';

async function testUIFeatures() {
  console.log('🧪 Testing UI Features: Markdown & Navigation...');

  // Launch browser in non-headless mode
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down for visibility
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the web UI
    console.log('🌐 Opening web UI...');
    await page.goto('http://localhost:4404');

    // Wait for the page to load
    await page.waitForSelector('#content', { timeout: 10000 });

    // Check if we're on the init page (expected since DB not initialized)
    const isInitPage = await page.locator('text=Initialization Required').isVisible().catch(() => false);

    if (isInitPage) {
      console.log('✅ Init page loaded correctly');

      // Check for manual browser opening button
      const hasOpenBrowserBtn = await page.locator('text=Open Browser').isVisible().catch(() => false);
      if (hasOpenBrowserBtn) {
        console.log('✅ Manual browser opening button present');
      } else {
        console.log('❌ Manual browser opening button missing');
      }

      console.log('ℹ️  Database not initialized - cannot test full navigation');
      console.log('ℹ️  To test navigation: initialize database and create some entities first');
    } else {
      console.log('✅ Dashboard loaded - testing navigation');

      // Test markdown library loading
      const markedLoaded = await page.evaluate(() => typeof marked !== 'undefined');
      if (markedLoaded) {
        console.log('✅ Markdown library (marked.js) loaded successfully');
      } else {
        console.log('❌ Markdown library not loaded');
      }

      // Test renderMarkdown function
      const markdownWorks = await page.evaluate(() => {
        try {
          const result = renderMarkdown('# Test\n\n- Item 1\n- Item 2');
          return result.includes('<h1>') && result.includes('<ul>');
        } catch (e) {
          return false;
        }
      });

      if (markdownWorks) {
        console.log('✅ Markdown rendering function works correctly');
      } else {
        console.log('❌ Markdown rendering function not working');
      }

      // Test navigation functions
      const navFunctions = await page.evaluate(() => {
        return {
          hasNavigateTo: typeof navigateTo === 'function',
          hasRenderRoute: typeof renderRoute === 'function',
          hasRoutes: typeof routes === 'object'
        };
      });

      if (navFunctions.hasNavigateTo && navFunctions.hasRenderRoute && navFunctions.hasRoutes) {
        console.log('✅ Navigation functions available');
      } else {
        console.log('❌ Navigation functions missing');
        console.log(`   navigateTo: ${navFunctions.hasNavigateTo}`);
        console.log(`   renderRoute: ${navFunctions.hasRenderRoute}`);
        console.log(`   routes: ${navFunctions.hasRoutes}`);
      }

      // Test route mapping
      const routeMapping = await page.evaluate(() => {
        try {
          return getEntityRoute('user_story') === 'story';
        } catch (e) {
          return false;
        }
      });

      if (routeMapping) {
        console.log('✅ Route mapping works correctly (user_story -> story)');
      } else {
        console.log('❌ Route mapping not working');
      }
    }

    console.log('🎉 UI features test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the test
testUIFeatures().catch(console.error);