import type { Result } from "~/shared/__schemas/shared.schemas";
import type { TokenEstimate } from "../__schemas/memory.schemas";
import { getEncoding } from "js-tiktoken";
import type { Tiktoken } from "js-tiktoken";

/**
 * Characters per token heuristic (GPT/Claude average).
 *
 * English text and code average approximately 4 characters per token.
 * This heuristic is accurate within ~10% for most content and is
 * sufficient as a fallback when the real tokenizer is unavailable.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Lazy singleton encoder instance.
 *
 * Initialized on first call to avoid import-time overhead.
 * Uses cl100k_base encoding which closely matches Claude/GPT-4 tokenization.
 */
let _encoder: Tiktoken | null = null;

/**
 * Get or create the singleton tiktoken encoder.
 *
 * @returns The cl100k_base encoder instance, or null if initialization fails
 */
function getEncoder(): Tiktoken | null {
  if (_encoder) return _encoder;
  try {
    _encoder = getEncoding("cl100k_base");
    return _encoder;
  } catch {
    return null;
  }
}

/**
 * Estimate token count using the ~4 chars/token heuristic.
 *
 * This is the original heuristic-based estimator, preserved as a
 * fallback when the real tokenizer is unavailable. Accurate within
 * ~10% for English text and code.
 *
 * @param text - The text to estimate
 * @returns Estimated token count (always >= 0)
 *
 * @example
 * ```typescript
 * estimateTokensHeuristic("hello world"); // 3 (11 chars / 4 = 2.75, ceil = 3)
 * estimateTokensHeuristic("");            // 0
 * ```
 */
export function estimateTokensHeuristic(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate token count for a text string.
 *
 * Uses the cl100k_base tokenizer from js-tiktoken for accurate
 * token counting. Falls back to the ~4 chars/token heuristic
 * if the tokenizer fails to initialize or encode.
 *
 * @param text - The text to estimate
 * @returns Estimated token count (always >= 0)
 *
 * @example
 * ```typescript
 * estimateTokens("hello world"); // 2 (real tokenizer)
 * estimateTokens("");            // 0
 * ```
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  try {
    const encoder = getEncoder();
    if (encoder) {
      return encoder.encode(text).length;
    }
    return estimateTokensHeuristic(text);
  } catch {
    return estimateTokensHeuristic(text);
  }
}

/**
 * Returns the active estimation method.
 *
 * Checks whether the tiktoken encoder is available and returns
 * "tiktoken" or "heuristic" accordingly. Useful for reporting
 * which method is being used in context usage results.
 *
 * @returns "tiktoken" if the real tokenizer is available, "heuristic" otherwise
 */
export function getEstimationMethod(): "tiktoken" | "heuristic" {
  try {
    const encoder = getEncoder();
    return encoder ? "tiktoken" : "heuristic";
  } catch {
    return "heuristic";
  }
}

/**
 * Estimate token count for a file on disk.
 *
 * Reads the file using Bun.file() and estimates tokens based on
 * the text content length. Returns a Result discriminated union
 * with token count and byte size on success, or an error message
 * on failure (e.g., file not found).
 *
 * @param filePath - Absolute or relative path to file
 * @returns Result with token count and byte size, or error if file not readable
 *
 * @example
 * ```typescript
 * const result = await estimateFileTokens("./MEMORY.md");
 * if (result.success) {
 *   console.log(`${result.data.tokens} tokens, ${result.data.bytes} bytes`);
 * }
 * ```
 */
export async function estimateFileTokens(
  filePath: string,
): Promise<Result<{ tokens: number; bytes: number }>> {
  try {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (!exists) {
      return {
        success: false,
        error: `File not found: ${filePath}`,
      };
    }

    const text = await file.text();
    const bytes = new TextEncoder().encode(text).byteLength;
    const tokens = estimateTokens(text);

    return {
      success: true,
      data: { tokens, bytes },
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Estimate token budget across multiple memory files.
 *
 * Reads each file, estimates tokens, and returns an aggregate
 * TokenEstimate with a per-file breakdown. Files that cannot be
 * read are skipped from the breakdown but do not cause the overall
 * operation to fail.
 *
 * @param paths - Array of file paths (e.g., BRAIN.md, MEMORY.md, WORKING.md, STATE.md)
 * @returns Result with TokenEstimate including per-file breakdown
 *
 * @example
 * ```typescript
 * const result = await estimateMemoryBudget([
 *   ".planning/BRAIN.md",
 *   ".planning/MEMORY.md",
 *   ".planning/WORKING.md",
 * ]);
 * if (result.success) {
 *   console.log(`Total: ${result.data.total_tokens} tokens`);
 *   for (const entry of result.data.breakdown) {
 *     console.log(`  ${entry.source}: ${entry.tokens} tokens`);
 *   }
 * }
 * ```
 */
export async function estimateMemoryBudget(
  paths: string[],
): Promise<Result<TokenEstimate>> {
  try {
    const breakdown: { source: string; tokens: number; bytes: number }[] = [];
    let totalTokens = 0;

    for (const filePath of paths) {
      const result = await estimateFileTokens(filePath);

      if (result.success) {
        breakdown.push({
          source: filePath,
          tokens: result.data.tokens,
          bytes: result.data.bytes,
        });
        totalTokens += result.data.tokens;
      }
      // Skip files that cannot be read -- they are omitted from breakdown
    }

    const estimate: TokenEstimate = {
      total_tokens: totalTokens,
      breakdown,
      timestamp: new Date().toISOString(),
    };

    return { success: true, data: estimate };
  } catch (err) {
    return {
      success: false,
      error: `Failed to estimate memory budget: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * CLI entry point for token estimation.
 *
 * Usage:
 *   bun run src/memory/token-estimator.ts <file1> [file2] [file3] ...
 *
 * Outputs JSON TokenEstimate to stdout.
 *
 * @example
 * ```sh
 * bun run src/memory/token-estimator.ts .planning/BRAIN.md .planning/MEMORY.md
 * ```
 */
if (import.meta.main) {
  const paths = Bun.argv.slice(2);

  if (paths.length === 0) {
    console.error(
      "Usage: bun run src/memory/token-estimator.ts <file1> [file2] ...",
    );
    process.exit(2);
  }

  const result = await estimateMemoryBudget(paths);

  if (result.success) {
    console.log(JSON.stringify(result.data, null, 2));
    process.exit(0);
  } else {
    console.error("Error:", result.error);
    process.exit(1);
  }
}
