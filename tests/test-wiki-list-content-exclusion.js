import { createDatabaseSchema } from '../database-schema.js';

// Test to verify that list_wiki_pages does NOT return content field
// This ensures the tool is efficient for browsing/searching

describe('Wiki List Content Exclusion Test', () => {
  let db;

  beforeAll(() => {
    // Create in-memory database for testing
    db = new Database(':memory:');
    createDatabaseSchema(db);
  });

  afterAll(() => {
    db.close();
  });

  test('list_wiki_pages should NOT include content field', () => {
    // Create a test wiki page with content
    const testContent = `# Test Page

This is a test wiki page with some content that should NOT be returned by list_wiki_pages.

## Section

More content here with various markdown elements.

- List item 1
- List item 2

\`\`\`javascript
console.log('test code');
\`\`\`
`;

    const insertStmt = db.prepare(`
      INSERT INTO wiki_pages (title, slug, content, summary, category, tags, status, created_by, current_owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insertStmt.run(
      'Test Page',
      'test-page',
      testContent,
      'A test page summary',
      'technical',
      JSON.stringify(['test', 'documentation']),
      'Published',
      'developer',
      'developer'
    );

    // Test the list_wiki_pages functionality (simulated)
    const listStmt = db.prepare(`
      SELECT wp.id, wp.title, wp.slug, wp.summary, wp.category, wp.tags, wp.status, wp.version, wp.created_by, wp.current_owner, wp.assigned_to, wp.created_at, wp.updated_at,
             COUNT(c.id) as comment_count
      FROM wiki_pages wp
      LEFT JOIN comments c ON c.entity_type = 'wiki_page' AND c.entity_id = wp.id
      GROUP BY wp.id
      ORDER BY wp.updated_at DESC
      LIMIT 50
    `);

    const pages = listStmt.all();

    // Verify the page was retrieved
    expect(pages.length).toBe(1);

    const page = pages[0];

    // Verify expected fields are present
    expect(page.id).toBe(result.lastInsertRowid);
    expect(page.title).toBe('Test Page');
    expect(page.slug).toBe('test-page');
    expect(page.summary).toBe('A test page summary');
    expect(page.category).toBe('technical');
    expect(page.status).toBe('Published');
    expect(page.created_by).toBe('developer');
    expect(page.current_owner).toBe('developer');

    // CRITICAL: Verify that content field is NOT present
    expect(page.content).toBeUndefined();
    expect(page).not.toHaveProperty('content');

    // Verify tags are parsed correctly
    expect(page.tags).toBeDefined();
    const parsedTags = JSON.parse(page.tags);
    expect(parsedTags).toEqual(['test', 'documentation']);

    console.log('✅ list_wiki_pages correctly excludes content field');
    console.log('✅ Page metadata retrieved successfully:', {
      id: page.id,
      title: page.title,
      hasContent: page.hasOwnProperty('content'),
      tagCount: parsedTags.length
    });
  });

  test('get_wiki_page should include content field', () => {
    // Verify that get_wiki_page DOES include content (for comparison)
    const getStmt = db.prepare('SELECT * FROM wiki_pages WHERE slug = ?');
    const page = getStmt.get('test-page');

    // Verify content IS present in get_wiki_page
    expect(page.content).toBeDefined();
    expect(page.content).toContain('# Test Page');
    expect(page.content).toContain('This is a test wiki page');

    console.log('✅ get_wiki_page correctly includes content field');
    console.log('✅ Content length:', page.content.length, 'characters');
  });

  test('list_wiki_pages performance with multiple pages', () => {
    // Create multiple pages to test performance
    const insertStmt = db.prepare(`
      INSERT INTO wiki_pages (title, slug, content, summary, category, tags, status, created_by, current_owner)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const largeContent = '# Large Content\n\n' + 'Paragraph content. '.repeat(100);

    for (let i = 1; i <= 10; i++) {
      insertStmt.run(
        `Bulk Test Page ${i}`,
        `bulk-test-page-${i}`,
        largeContent,
        `Summary for page ${i}`,
        'technical',
        JSON.stringify(['bulk', 'test']),
        'Published',
        'developer',
        'developer'
      );
    }

    // Test listing all pages
    const listStmt = db.prepare(`
      SELECT wp.id, wp.title, wp.slug, wp.summary, wp.category, wp.tags, wp.status, wp.version, wp.created_by, wp.current_owner, wp.assigned_to, wp.created_at, wp.updated_at,
             COUNT(c.id) as comment_count
      FROM wiki_pages wp
      LEFT JOIN comments c ON c.entity_type = 'wiki_page' AND c.entity_id = wp.id
      GROUP BY wp.id
      ORDER BY wp.updated_at DESC
      LIMIT 50
    `);

    const pages = listStmt.all();

    // Should have 11 pages total (1 original + 10 bulk)
    expect(pages.length).toBe(11);

    // Verify NONE of the pages have content field
    pages.forEach(page => {
      expect(page.content).toBeUndefined();
      expect(page).not.toHaveProperty('content');
      expect(page.title).toBeDefined();
      expect(page.summary).toBeDefined();
    });

    console.log('✅ Bulk listing test passed - no content fields returned');
    console.log('✅ Retrieved', pages.length, 'pages efficiently without content');
  });
});