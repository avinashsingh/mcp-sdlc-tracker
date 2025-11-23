/**
 * Simple Marqant-inspired compression for markdown content
 * This is a JavaScript implementation that provides basic token-based compression
 * to reduce token usage in AI contexts while maintaining readability.
 */

export class SimpleMarqantCompressor {
    constructor() {
        // Common markdown patterns that can be tokenized
        this.commonPatterns = [
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

        this.tokenCounter = 0;
        this.tokenMap = new Map();
        this.reverseMap = new Map();
    }

    /**
     * Compress markdown content using token substitution
     */
    compress(content) {
        if (!content || typeof content !== 'string') {
            return content;
        }

        let compressed = content;
        let tokens = [];

        // Find and replace common patterns with tokens
        this.commonPatterns.forEach(({ pattern, token }, index) => {
            compressed = compressed.replace(pattern, (match) => {
                const tokenId = `~${token}_${index}_${this.tokenCounter++}~`;
                tokens.push({ tokenId, original: match });
                return tokenId;
            });
        });

        // Create the compressed output with token map
        const tokenMapJson = JSON.stringify(tokens);
        const compressedOutput = `MARQANT_COMPRESSED\n${tokenMapJson}\n---CONTENT---\n${compressed}`;

        return compressedOutput;
    }

    /**
     * Decompress content back to original markdown
     */
    decompress(compressedContent) {
        if (!compressedContent || typeof compressedContent !== 'string') {
            return compressedContent;
        }

        if (!compressedContent.startsWith('MARQANT_COMPRESSED')) {
            return compressedContent; // Not compressed, return as-is
        }

        try {
            const lines = compressedContent.split('\n');
            const tokenMapJson = lines[1];
            const contentStart = compressedContent.indexOf('---CONTENT---\n') + 14;
            let content = compressedContent.substring(contentStart);

            const tokens = JSON.parse(tokenMapJson);

            // Replace tokens back with original content
            tokens.forEach(({ tokenId, original }) => {
                content = content.split(tokenId).join(original);
            });

            return content;
        } catch (error) {
            console.warn('Failed to decompress content:', error);
            return compressedContent; // Return original if decompression fails
        }
    }

    /**
     * Get compression ratio (0.0 to 1.0, where 1.0 = 100% reduction)
     */
    getCompressionRatio(original, compressed) {
        if (!original || !compressed || original.length === 0) {
            return 0;
        }
        return Math.max(0, 1 - (compressed.length / original.length));
    }

    /**
     * Check if content is compressed
     */
    isCompressed(content) {
        return content && typeof content === 'string' &&
               content.startsWith('MARQANT_COMPRESSED');
    }
}

// Export singleton instance
export const marqantCompressor = new SimpleMarqantCompressor();