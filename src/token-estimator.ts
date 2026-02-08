/**
 * Token estimation utilities for dynamic batch sizing
 */

/**
 * Estimate token count for a text string
 * 
 * Rules of thumb:
 * - English: ~4 characters per token
 * - Russian/Cyrillic: ~3 characters per token
 * - Technical text (code, placeholders): ~5 characters per token
 * 
 * @param text - Text to estimate tokens for
 * @returns Estimated token count
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  // Detect script type
  const cyrillicRatio = (text.match(/[\u0400-\u04FF]/g) || []).length / text.length;
  const hasPlaceholders = /[#%{}<>]/.test(text);

  let charsPerToken: number;
  if (cyrillicRatio > 0.5) {
    // Predominantly Cyrillic (Russian, Ukrainian, etc.)
    charsPerToken = 3;
  } else if (hasPlaceholders) {
    // Technical text with placeholders
    charsPerToken = 5;
  } else {
    // English and other Latin scripts
    charsPerToken = 4;
  }

  return Math.ceil(text.length / charsPerToken);
}

/**
 * Estimate tokens for a translation item including all its context
 * 
 * @param item - Translation item with key, filename, context, and targets
 * @returns Estimated token count for this item
 */
export function estimateItemTokens(item: {
  key: string;
  fileName: string;
  context: Record<string, string>;
  targets: string[];
}): number {
  let tokens = 0;

  // Key and filename (metadata)
  tokens += estimateTokens(item.key);
  tokens += estimateTokens(item.fileName);

  // Context translations
  for (const text of Object.values(item.context)) {
    tokens += estimateTokens(text);
  }

  // JSON structure overhead (~10% of content)
  tokens = Math.ceil(tokens * 1.1);

  return tokens;
}

/**
 * Estimate tokens for system prompt (fixed overhead)
 */
export const SYSTEM_PROMPT_TOKENS = 150;

/**
 * Estimate tokens for JSON response wrapper overhead per item
 * (includes "items", "key", "translations", "lang", "text" fields)
 */
export const RESPONSE_OVERHEAD_PER_ITEM = 20;

/**
 * Calculate estimated response tokens for a batch of items
 * 
 * @param items - Array of translation items
 * @param avgResponseMultiplier - Multiplier for response size (default: 1.2 = 20% larger than input)
 * @returns Estimated response token count
 */
export function estimateResponseTokens(
  items: Array<{
    key: string;
    fileName: string;
    context: Record<string, string>;
    targets: string[];
  }>,
  avgResponseMultiplier = 1.2
): number {
  let tokens = 0;

  for (const item of items) {
    // Each target language generates a translation similar to input size
    const contextTokens = Object.values(item.context)
      .reduce((sum, text) => sum + estimateTokens(text), 0);
    
    tokens += contextTokens * item.targets.length * avgResponseMultiplier;
    tokens += RESPONSE_OVERHEAD_PER_ITEM * item.targets.length;
  }

  return Math.ceil(tokens);
}

/**
 * Build a dynamic batch that fits within token limits
 * 
 * @param items - All items to batch
 * @param maxPromptTokens - Maximum tokens for prompt (input)
 * @param maxResponseTokens - Maximum tokens for response (output)
 * @returns Array of batches, each batch is an array of items
 */
export function buildDynamicBatches<T extends {
  key: string;
  fileName: string;
  context: Record<string, string>;
  targets: string[];
}>(
  items: T[],
  maxPromptTokens: number,
  maxResponseTokens: number
): T[][] {
  const batches: T[][] = [];
  let currentBatch: T[] = [];
  let currentPromptTokens = SYSTEM_PROMPT_TOKENS;

  for (const item of items) {
    const itemTokens = estimateItemTokens(item);
    const potentialPromptTokens = currentPromptTokens + itemTokens;
    
    // Check if adding this item would exceed limits
    const potentialResponseTokens = estimateResponseTokens([...currentBatch, item]);
    
    if (currentBatch.length > 0 && 
        (potentialPromptTokens > maxPromptTokens || 
         potentialResponseTokens > maxResponseTokens)) {
      // Start new batch
      batches.push(currentBatch);
      currentBatch = [item];
      currentPromptTokens = SYSTEM_PROMPT_TOKENS + itemTokens;
    } else {
      // Add to current batch
      currentBatch.push(item);
      currentPromptTokens = potentialPromptTokens;
    }
  }

  // Add final batch
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}
