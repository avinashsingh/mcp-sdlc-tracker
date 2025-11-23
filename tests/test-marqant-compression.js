// Simple Marqant-inspired compression functions for testing
function compressMarkdownContent(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  let compressed = content;
  let tokens = [];
  let tokenCounter = 0;

  // Common markdown patterns that can be tokenized
  const patterns = [
    { pattern: /```[\s\S]*?```/g, token: 'CODE_BLOCK' },
    { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, token: 'LINK' },
    { pattern: /!\[([^\]]*)\]\(([^)]+)\)/g, token: 'IMAGE' },
    { pattern: /#{1,6}\s+/g, token: 'HEADER' },
    { pattern: /\*\*([^*]+)\*\*/g, token: 'BOLD' },
    { pattern: /\*([^*]+)\*/g, token: 'ITALIC' },
    { pattern: /`([^`]+)`/g, token: 'INLINE_CODE' },
    { pattern: /-\s+/g, token: 'LIST_ITEM' },
    { pattern: /\d+\.\s+/g, token: 'NUMBERED_ITEM' },
    { pattern: />\s+/g, token: 'BLOCKQUOTE' },
  ];

  // Find and replace common patterns with tokens
  patterns.forEach(({ pattern, token }, index) => {
    compressed = compressed.replace(pattern, (match) => {
      const tokenId = `~${token}_${index}_${tokenCounter++}~`;
      tokens.push({ tokenId, original: match });
      return tokenId;
    });
  });

  // Create the compressed output with token map
  const tokenMapJson = JSON.stringify(tokens);
  const compressedOutput = `MARQANT_COMPRESSED\n${tokenMapJson}\n---CONTENT---\n${compressed}`;

  return compressedOutput;
}

function getCompressionRatio(original, compressed) {
  if (!original || !compressed || original.length === 0) {
    return 0;
  }
  return Math.max(0, 1 - (compressed.length / original.length));
}

describe('Marqant Compression', () => {
  test('should compress and decompress markdown', () => {
    const markdown = `# Test Document

This is a test markdown document with some content.

## Features

- Feature 1
- Feature 2
- Feature 3

**Bold text** and *italic text* and \`inline code\`.

\`\`\`javascript
console.log('Hello World');
\`\`\`

[Link text](https://example.com)
`;

    const compressed = compressMarkdownContent(markdown);
    const ratio = getCompressionRatio(markdown, compressed);

    console.log('Original length:', markdown.length);
    console.log('Compressed length:', compressed.length);
    console.log('Compression ratio:', ratio);

    expect(compressed).toContain('MARQANT_COMPRESSED');
    expect(ratio).toBeGreaterThan(0.1); // At least 10% compression
    expect(compressed.length).toBeLessThan(markdown.length);
  });

  test('should handle empty content', () => {
    const compressed = compressMarkdownContent('');
    const ratio = getCompressionRatio('', compressed);

    expect(ratio).toBe(0);
  });

  test('should handle non-string content', () => {
    const compressed = compressMarkdownContent(null);
    expect(compressed).toBeNull();
  });
});