export interface SlugifyOptions {
  /** Longest slug to return. The cut never leaves a dash at the end. */
  maxLength?: number;
}

/**
 * Turns text into a URL-safe slug: lowercase ASCII letters and digits with
 * single dashes between words. Accents are stripped via NFKD; any other
 * non-ASCII character is dropped.
 */
export function slugify(text: string, options: SlugifyOptions = {}): string {
  const slug = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\x00-\x7F]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (options.maxLength === undefined) return slug;
  return slug.slice(0, Math.max(0, options.maxLength)).replace(/-+$/, "");
}
