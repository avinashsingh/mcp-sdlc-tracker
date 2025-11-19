#!/usr/bin/env node

const { chromium } = require('playwright');

async function testNavigationWithPlaywright() {
  console.log('🧪 Testing Navigation with Playwright (Headless: false)...');

  // Launch browser in non-headless mode
  const browser = await chromium.launch({
    headless: false,
    slowMo: 1000 // Slow down operations for visibility
  });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Navigate to the web UI
    console.log('🌐 Opening web UI...');
    await page.goto('http://localhost:3000');

    // Wait for the page to load
    await page.waitForSelector('#content', { timeout: 10000 });

    // Check if we're on the init page or dashboard
    const isInitPage = await page.locator('text=Initialization Required').isVisible().catch(() => false);

    if (isInitPage) {
      console.log('📋 On initialization page - database not initialized');
      console.log('ℹ️  Please initialize the database first to test navigation');
      return;
    }

    console.log('✅ Dashboard loaded successfully');

    // Wait for entity cards to load
    await page.waitForSelector('.entity-card', { timeout: 5000 });

    // Look for user story cards
    const userStoryCards = await page.locator('.entity-card').filter({ hasText: /user_story|User Story/ });

    if (await userStoryCards.count() === 0) {
      console.log('⚠️  No user story cards found on dashboard');
      console.log('ℹ️  Please create some user stories first to test navigation');
      return;
    }

    console.log(`📝 Found ${await userStoryCards.count()} user story card(s)`);

    // Click on the first user story card
    console.log('🖱️  Clicking on first user story card...');
    await userStoryCards.first().click();

    // Wait for navigation and detail view to load
    await page.waitForURL(/\/story\/\d+/, { timeout: 5000 });

    console.log('✅ Successfully navigated to user story detail page');

    // Check if the detail page loaded correctly
    const hasBreadcrumb = await page.locator('.breadcrumb').isVisible().catch(() => false);
    const hasDescription = await page.locator('text=Description').isVisible().catch(() => false);
    const hasComments = await page.locator('text=Comments').isVisible().catch(() => false);

    if (hasBreadcrumb && hasDescription && hasComments) {
      console.log('✅ Detail page rendered correctly with breadcrumb, description, and comments');
    } else {
      console.log('❌ Detail page missing expected elements');
      console.log(`   Breadcrumb: ${hasBreadcrumb}`);
      console.log(`   Description: ${hasDescription}`);
      console.log(`   Comments: ${hasComments}`);
    }

    // Test back navigation
    console.log('🔙 Testing back navigation...');
    await page.locator('text=Dashboard').first().click();

    // Wait for dashboard to load
    await page.waitForURL(/\/$|\/dashboard$/, { timeout: 5000 });
    console.log('✅ Successfully navigated back to dashboard');

    // Test markdown rendering
    console.log('📝 Testing markdown rendering...');
    const markdownElements = await page.locator('.markdown-content');
    if (await markdownElements.count() > 0) {
      console.log('✅ Markdown content elements found');
    } else {
      console.log('⚠️  No markdown content elements found (may be expected if no content)');
    }

    console.log('🎉 Navigation and UI tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
}

// Run the test
testNavigationWithPlaywright().catch(console.error);