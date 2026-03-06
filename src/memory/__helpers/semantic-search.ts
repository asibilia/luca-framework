/**
 * Semantic search for memory entries using TF-IDF with word tokens.
 *
 * Provides local-only semantic recall without external API calls.
 * Tokenizes text, computes TF-IDF vectors, and ranks memories by
 * cosine similarity to a query string.
 *
 * @module memory/semantic-search
 */
import type { MemoryEntry } from "../__schemas/memory.schemas";

// ─── Stop Words ────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "my",
  "no",
  "nor",
  "not",
  "of",
  "on",
  "or",
  "our",
  "out",
  "own",
  "so",
  "some",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "too",
  "up",
  "us",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "who",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

// ─── Tokenization ──────────────────────────────────────────────────────────────

/**
 * Tokenize text into lowercase words with stop words removed.
 *
 * Splits on non-alphanumeric boundaries, lowercases, removes stop words
 * and single-character tokens.
 *
 * @param text - Input text to tokenize
 * @returns Array of cleaned tokens
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

// ─── TF-IDF ────────────────────────────────────────────────────────────────────

/**
 * Compute a TF-IDF vector for a set of tokens given a corpus.
 *
 * TF = frequency of token in document / total tokens in document
 * IDF = log(total documents / documents containing token)
 *
 * @param tokens - Tokens from a single document
 * @param corpus - Array of token arrays representing all documents
 * @returns Map of token to TF-IDF weight
 */
export function computeTfIdf(
  tokens: string[],
  corpus: string[][],
): Map<string, number> {
  const totalDocs = corpus.length;
  const result = new Map<string, number>();

  if (tokens.length === 0 || totalDocs === 0) return result;

  // Compute term frequency for this document
  const tf = new Map<string, number>();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) ?? 0) + 1);
  }

  // Compute document frequency for each unique token
  const uniqueTokens = new Set(tokens);
  for (const token of uniqueTokens) {
    let docCount = 0;
    for (const doc of corpus) {
      if (doc.includes(token)) {
        docCount++;
      }
    }

    const termFreq = (tf.get(token) ?? 0) / tokens.length;
    const inverseDocFreq = Math.log((totalDocs + 1) / (docCount + 1)) + 1;

    result.set(token, termFreq * inverseDocFreq);
  }

  return result;
}

// ─── Cosine Similarity ─────────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two TF-IDF vectors.
 *
 * @param a - First TF-IDF vector
 * @param b - Second TF-IDF vector
 * @returns Similarity score between 0.0 and 1.0
 */
export function cosineSimilarity(
  a: Map<string, number>,
  b: Map<string, number>,
): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (const [token, weight] of a) {
    normA += weight * weight;
    const bWeight = b.get(token);
    if (bWeight !== undefined) {
      dotProduct += weight * bWeight;
    }
  }

  for (const [, weight] of b) {
    normB += weight * weight;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

// ─── Semantic Recall ───────────────────────────────────────────────────────────

/**
 * Result of semantic recall: a memory entry with its similarity score.
 */
export interface SemanticRecallResult {
  entry: MemoryEntry;
  score: number;
}

/**
 * Rank memory entries by semantic similarity to a query string.
 *
 * Uses TF-IDF with word tokens to compute similarity. Combines each entry's
 * title, content, and tags into a single text for comparison.
 *
 * Returns entries sorted by descending similarity score.
 * Entries with zero similarity are excluded.
 *
 * @param query - Natural language query string
 * @param memories - Array of memory entries to search
 * @param limit - Maximum number of results to return (default: 10)
 * @returns Ranked memory entries with similarity scores
 *
 * @example
 * ```typescript
 * const results = semanticRecall("state machine workflow", memories);
 * // results[0] has the highest similarity to the query
 * ```
 */
export function semanticRecall(
  query: string,
  memories: MemoryEntry[],
  limit: number = 10,
): SemanticRecallResult[] {
  if (memories.length === 0 || !query.trim()) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // Build corpus: each memory becomes a document of tokens
  const memoryTexts = memories.map((m) =>
    [m.title, m.content, ...m.tags].join(" "),
  );
  const corpus = memoryTexts.map((text) => tokenize(text));

  // Include query in corpus for IDF computation
  const fullCorpus = [...corpus, queryTokens];

  // Compute TF-IDF for query
  const queryVector = computeTfIdf(queryTokens, fullCorpus);

  // Score each memory
  const results: SemanticRecallResult[] = [];

  for (let i = 0; i < memories.length; i++) {
    const docVector = computeTfIdf(corpus[i]!, fullCorpus);
    const score = cosineSimilarity(queryVector, docVector);

    if (score > 0) {
      results.push({
        entry: memories[i]!,
        score: Math.round(score * 1000) / 1000,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, limit);
}
