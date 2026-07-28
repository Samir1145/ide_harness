/**
 * Parses a model name string and returns estimated parameter count and quality tier.
 * Examples: 'qwen2.5-coder:1.5b' → 1.5, 'llama3:8b' → 8, 'mixtral:47b' → 47
 */
function parseModelSize(modelName) {
    const match = (modelName || '').match(/(\d+\.?\d*)\s*b/i);
    if (!match) {
        return { sizeB: null, tier: 'unknown' };
    }
    const sizeB = parseFloat(match[1]);
    let tier = 'large';
    if (sizeB < 7.0) {
        tier = 'small';
    } else if (sizeB <= 14.0) {
        tier = 'medium';
    }
    return {
        sizeB,
        tier
    };
}

module.exports = { parseModelSize };
