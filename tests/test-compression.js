#!/usr/bin/env node

// Simple test script for Marqant compression
function compressMarkdownContent(content) {
  if (!content || typeof content !== 'string') {
    return content;
  }

  let compressed = content;
  let tokenMap = new Map();
  let tokenCounter = 0;

  // Common markdown patterns that can be tokenized
  const patterns = [
    { pattern: /```[\s\S]*?```/g, token: 'CB' },  // Code blocks
    { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, token: 'LK' },  // Links
    { pattern: /!\[([^\]]*)\]\(([^)]+)\)/g, token: 'IM' },  // Images
    { pattern: /#{1,6}\s+/g, token: 'H' },  // Headers
    { pattern: /\*\*([^*]+)\*\*/g, token: 'BD' },  // Bold
    { pattern: /\*([^*]+)\*/g, token: 'IT' },  // Italic
    { pattern: /`([^`]+)`/g, token: 'IC' },  // Inline code
    { pattern: /-\s+/g, token: 'LI' },  // List items
    { pattern: /\d+\.\s+/g, token: 'NI' },  // Numbered items
    { pattern: />\s+/g, token: 'BQ' },  // Blockquotes
  ];

  // Find and replace common patterns with short tokens
  patterns.forEach(({ pattern, token }) => {
    compressed = compressed.replace(pattern, (match) => {
      // Only tokenize if it saves space (token shorter than original)
      const shortToken = `~${token}${tokenCounter++}~`;
      if (shortToken.length < match.length) {
        tokenMap.set(shortToken, match);
        return shortToken;
      }
      return match; // Don't tokenize if it doesn't save space
    });
  });

  // Only compress if we actually saved space
  // Calculate actual space saved by tokenization
  const originalTokenChars = Array.from(tokenMap.values()).reduce((sum, token) => sum + token.length, 0);
  const compressedTokenChars = Array.from(tokenMap.keys()).reduce((sum, token) => sum + token.length, 0);
  const spaceSaved = originalTokenChars - compressedTokenChars;

  if (spaceSaved > 50) { // Only compress if we save at least 50 chars
    const tokenMapJson = JSON.stringify(Array.from(tokenMap.entries()));
    const compressedWithMap = `MQ\n${tokenMapJson}\n--\n${compressed}`;
    return compressedWithMap;
  } else {
    return content; // Return original if compression doesn't help
  }
}

function getCompressionRatio(original, compressed) {
  if (!original || !compressed || original.length === 0) {
    return 0;
  }
  return Math.max(0, 1 - (compressed.length / original.length));
}

function decompressContent(compressedContent) {
  if (!compressedContent || typeof compressedContent !== 'string') {
    return compressedContent;
  }

  if (!compressedContent.startsWith('MQ\n')) {
    return compressedContent; // Not compressed, return as-is
  }

  try {
    const lines = compressedContent.split('\n');
    const tokenMapJson = lines[1];
    const contentStart = compressedContent.indexOf('--\n') + 3;
    let content = compressedContent.substring(contentStart);

    const tokenEntries = JSON.parse(tokenMapJson);

    // Replace tokens back with original content
    tokenEntries.forEach(([tokenId, original]) => {
      content = content.split(tokenId).join(original);
    });

    return content;
  } catch (error) {
    console.warn('Failed to decompress content:', error);
    return compressedContent; // Return original if decompression fails
  }
}

// Test the compression
const testMarkdown = `# Test Document

This is a test markdown document with some content that includes many repeated patterns to demonstrate compression effectiveness.

## Features

- Feature 1 with **bold text** and *italic text*
- Feature 2 with **bold text** and *italic text*
- Feature 3 with **bold text** and *italic text*
- Another feature with **bold text** and *italic text*
- Yet another feature with **bold text** and *italic text*

## More Sections

### Subsection 1

Some content with \`inline code\` and more \`inline code\` examples.

### Subsection 2

Additional content with \`inline code\` and \`inline code\` patterns.

## Links Section

Here are some links: [Google](https://google.com), [GitHub](https://github.com), [Stack Overflow](https://stackoverflow.com), [MDN](https://developer.mozilla.org), [Node.js](https://nodejs.org).

More links: [Google](https://google.com), [GitHub](https://github.com), [Stack Overflow](https://stackoverflow.com).

## Code Examples

\`\`\`javascript
function test() {
  console.log('Hello World');
  console.log('This is a test');
}
\`\`\`

\`\`\`python
def test():
    print("Hello World")
    print("This is a test")
\`\`\`

## Blockquotes

> This is a blockquote with some text.
> This is another blockquote line.
> More blockquote content here.

> Another blockquote section.
> With multiple lines.
> And more content.

## Lists

- Item 1 with **bold** and *italic*
- Item 2 with **bold** and *italic*
- Item 3 with **bold** and *italic*
- Item 4 with **bold** and *italic*

1. Numbered item 1 with \`code\`
2. Numbered item 2 with \`code\`
3. Numbered item 3 with \`code\`
4. Numbered item 4 with \`code\`

## Final Section

This concludes our test document with various markdown elements to test compression algorithms.`;

console.log('🧪 Testing Marqant Compression');
console.log('================================');
console.log('Original content length:', testMarkdown.length);

const compressed = compressMarkdownContent(testMarkdown);
console.log('Compressed content length:', compressed.length);

const ratio = getCompressionRatio(testMarkdown, compressed);
console.log('Compression ratio:', (ratio * 100).toFixed(1) + '%');

const decompressed = decompressContent(compressed);
const isSame = testMarkdown.trim() === decompressed.trim();
console.log('Round-trip successful:', isSame);

if (ratio > 0.1) {
  console.log('🎉 Compression achieved >10% reduction!');
} else {
  console.log('⚠️  Compression ratio below 10%');
}