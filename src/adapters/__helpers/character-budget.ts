/**
 * Shared character-budget enforcement for IDE adapters.
 *
 * Enforces IDE-specific character limits by truncating content at section
 * boundaries rather than raw character offsets. This preserves structural
 * validity of markdown files (frontmatter, headings) while fitting within
 * adapter-specific constraints.
 *
 * Used by:
 * - Windsurf adapter: 12K per workspace rule, 6K global
 * - VS Code adapter: 30K per agent profile
 *
 * @module
 */

/**
 * Result of enforcing a character budget on content.
 *
 * @property result - The (possibly truncated) content string
 * @property truncated - Whether any content was removed
 * @property warning - Human-readable warning for EmitResult.warnings, or null if no truncation
 */
export type CharacterBudgetResult = {
  result: string;
  truncated: boolean;
  warning: string | null;
};

/**
 * Enforce a character budget on markdown content by truncating at section boundaries.
 *
 * Algorithm (section-boundary truncation, NOT raw slice):
 *
 * 1. If `content.length <= maxChars`, return content unchanged.
 * 2. Split content into frontmatter (between first `---` and second `---`)
 *    and body sections (split on `## ` heading markers).
 * 3. Preserve frontmatter entirely (it is required for rule validity).
 * 4. Iterate sections in reverse order (lowest priority last), dropping
 *    entire sections until the total fits within `maxChars`.
 * 5. If a single section still exceeds the budget after all others are
 *    dropped, truncate that section at the last complete line that fits.
 * 6. Append a truncation marker with the source path and character count.
 * 7. Return `{ result, truncated: true, warning }`.
 *
 * Truncation marker format:
 * ```
 * \n\n[Truncated -- full content at {sourcePath}. {removedChars} chars removed.]\n
 * ```
 *
 * @param content - The full markdown content to budget
 * @param maxChars - Maximum allowed character count
 * @param sourcePath - Path to the original file (included in truncation marker)
 * @returns The budget result with possibly truncated content and warning
 *
 * @example
 * ```typescript
 * const { result, truncated, warning } = enforceCharacterBudget(
 *   longMarkdown,
 *   12000,
 *   "src/rules/general/my-rule.rule.ts"
 * );
 *
 * if (truncated && warning) {
 *   emitResult.warnings.push(warning);
 * }
 * ```
 */
export function enforceCharacterBudget(
  content: string,
  maxChars: number,
  sourcePath: string,
): CharacterBudgetResult {
  // Fast path: content already within budget
  if (content.length <= maxChars) {
    return { result: content, truncated: false, warning: null };
  }

  const originalLength = content.length;

  // --- Step 2: Split into frontmatter and body ---
  const { frontmatter, body } = splitFrontmatterAndBody(content);

  // --- Step 3: Frontmatter is always preserved ---
  // If frontmatter alone exceeds budget, we cannot satisfy the constraint
  // but we still preserve it (frontmatter is required for rule validity).
  const truncationMarkerTemplate = buildTruncationMarker(sourcePath, 0);
  const reservedForMarker = truncationMarkerTemplate.length + 20; // +20 for digit variance in char count
  const budgetForBody = maxChars - frontmatter.length - reservedForMarker;

  if (budgetForBody <= 0) {
    // Frontmatter alone exceeds budget; return frontmatter + marker
    const marker = buildTruncationMarker(
      sourcePath,
      originalLength - frontmatter.length,
    );
    const result = frontmatter + marker;
    return {
      result,
      truncated: true,
      warning: `Truncated ${sourcePath}: removed ${originalLength - frontmatter.length} chars (frontmatter alone exceeds ${maxChars} char budget)`,
    };
  }

  // --- Step 2 (cont): Split body into sections at `## ` headings ---
  const sections = splitIntoSections(body);

  // --- Step 4: Drop sections from the end (lowest priority) until it fits ---
  const keptSections: string[] = [];
  let currentBodyLength = 0;

  // First pass: determine how many sections we can keep (in order)
  for (const section of sections) {
    if (currentBodyLength + section.length <= budgetForBody) {
      keptSections.push(section);
      currentBodyLength += section.length;
    } else {
      // This section doesn't fit entirely.
      // --- Step 5: Truncate this section at the last complete line that fits ---
      const remainingBudget = budgetForBody - currentBodyLength;
      if (remainingBudget > 0) {
        const truncatedSection = truncateAtLineBreak(section, remainingBudget);
        if (truncatedSection.length > 0) {
          keptSections.push(truncatedSection);
        }
      }
      // Drop all remaining sections
      break;
    }
  }

  // Reassemble
  const truncatedBody = keptSections.join("");
  const removedChars =
    originalLength - frontmatter.length - truncatedBody.length;
  const marker = buildTruncationMarker(sourcePath, removedChars);
  const result = frontmatter + truncatedBody + marker;

  return {
    result,
    truncated: true,
    warning: `Truncated ${sourcePath}: removed ${removedChars} chars to fit ${maxChars} char budget`,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split markdown content into frontmatter (including delimiters) and body.
 *
 * Frontmatter is the text between the first `---\n` and the second `---\n`
 * (inclusive of delimiters and the trailing newline).
 *
 * @param content - Full markdown content
 * @returns Object with frontmatter and body strings
 */
function splitFrontmatterAndBody(content: string): {
  frontmatter: string;
  body: string;
} {
  // Check if content starts with frontmatter delimiter
  if (!content.startsWith("---")) {
    return { frontmatter: "", body: content };
  }

  // Find the closing delimiter (second `---`)
  const closingIndex = content.indexOf("\n---", 3);
  if (closingIndex === -1) {
    // No closing delimiter found; treat entire content as body
    return { frontmatter: "", body: content };
  }

  // Find end of closing delimiter line
  const endOfClosing = content.indexOf("\n", closingIndex + 4);
  if (endOfClosing === -1) {
    // Closing delimiter is at very end of content
    return { frontmatter: content, body: "" };
  }

  const frontmatter = content.slice(0, endOfClosing + 1);
  const body = content.slice(endOfClosing + 1);
  return { frontmatter, body };
}

/**
 * Split a body string into sections at `## ` heading markers.
 *
 * Each section includes its heading line and all content up to the next
 * `## ` heading (or end of string). Content before the first heading
 * is preserved as the first section.
 *
 * @param body - The body text (after frontmatter)
 * @returns Array of section strings, preserving order
 */
function splitIntoSections(body: string): string[] {
  const sections: string[] = [];
  // Split on lines that start with `## ` (keeping the delimiter)
  const parts = body.split(/(?=^## )/m);

  for (const part of parts) {
    if (part.length > 0) {
      sections.push(part);
    }
  }

  return sections;
}

/**
 * Truncate a string at the last complete line that fits within maxLength.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum character count
 * @returns The truncated text ending at a line boundary
 */
function truncateAtLineBreak(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf("\n");

  if (lastNewline === -1) {
    // No newline in budget; return empty to avoid mid-line truncation
    return "";
  }

  return truncated.slice(0, lastNewline + 1);
}

/**
 * Build the truncation marker appended to truncated content.
 *
 * @param sourcePath - Path to the full source file
 * @param removedChars - Number of characters removed
 * @returns The truncation marker string
 */
function buildTruncationMarker(
  sourcePath: string,
  removedChars: number,
): string {
  return `\n\n[Truncated -- full content at ${sourcePath}. ${removedChars} chars removed.]\n`;
}
