"use client";

import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ShikiCodeBlockProps = {
  /** Source code string to highlight. */
  code: string;
  /** Language identifier for Shiki (e.g. "typescript", "markdown"). */
  language: string;
  /** Additional CSS class names for the outer wrapper. */
  className?: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Static syntax-highlighted code block using Shiki with client-side highlighting.
 *
 * Performs Shiki highlighting on the client in a `useEffect` and is therefore
 * SSR-safe (no server-side highlighting). On the server it renders a plain
 * `<pre><code>` block, which is then upgraded to highlighted HTML once the
 * highlighter has loaded in the browser. Uses the `github-dark` and
 * `github-light` themes to match the app's dark/light mode via CSS.
 *
 * @param code - The source code to highlight.
 * @param language - The Shiki language identifier.
 * @param className - Additional CSS classes for the outer wrapper.
 *
 * @example
 * ```tsx
 * <ShikiCodeBlock
 *   code="const x: number = 42;"
 *   language="typescript"
 * />
 * ```
 */
export function ShikiCodeBlock({
  code,
  language,
  className,
}: ShikiCodeBlockProps) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        const { codeToHtml } = await import("shiki");
        const result = await codeToHtml(code, {
          lang: language,
          themes: {
            light: "github-light",
            dark: "github-dark",
          },
        });
        if (!cancelled) {
          setHtml(result);
        }
      } catch {
        // If highlighting fails, keep the fallback <pre>
        if (!cancelled) {
          setHtml(null);
        }
      }
    }

    void highlight();
    return () => {
      cancelled = true;
    };
  }, [code, language]);

  if (html) {
    return (
      <div
        className={cn(
          "overflow-auto rounded-md text-sm [&_pre]:p-4 [&_pre]:leading-relaxed",
          className,
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  // Fallback: plain pre block while Shiki loads
  return (
    <pre
      className={cn(
        "overflow-auto rounded-md bg-muted p-4 font-mono text-sm leading-relaxed",
        className,
      )}
    >
      <code>{code}</code>
    </pre>
  );
}
