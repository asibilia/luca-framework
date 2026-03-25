"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder as placeholderExt,
  type ViewUpdate,
} from "@codemirror/view";
import { Bold, Code, Italic, Variable } from "lucide-react";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Imperative handle exposed via `ref`. */
export type CodeMirrorHandle = {
  /** Focus the editor. */
  focus: () => void;
  /** Scroll the editor to the given position. */
  scrollTo: (pos: number) => void;
  /** Get the underlying EditorView instance. */
  getView: () => EditorView | null;
};

/** Props for the CodeMirrorWrapper component. */
export type CodeMirrorWrapperProps = {
  /** Current editor content. Defaults to `""`. */
  value?: string;
  /** Called on every document change with the new string value. */
  onChange?: (value: string) => void;
  /** When true, editing is disabled and the toolbar is hidden. Defaults to `false`. */
  readOnly?: boolean;
  /** Placeholder text shown when the editor is empty. */
  placeholder?: string;
  /** Additional CSS class names for the outer wrapper. */
  className?: string;
};

// -- Prop defaults (single source of truth) -----------------------------------

/** Default value for the editor content prop. */
const DEFAULT_VALUE = "";

/** Default value for the readOnly prop. */
const DEFAULT_READ_ONLY = false;

// ---------------------------------------------------------------------------
// Luca Theme (CSS-variable-aware)
// ---------------------------------------------------------------------------

/**
 * Custom CodeMirror theme that reads from the app's CSS custom properties.
 *
 * This ensures the editor adapts to light/dark mode automatically via the
 * same design tokens used by shadcn/ui and Tailwind.
 */
const lucaTheme = EditorView.theme({
  "&": {
    fontSize: "14px",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  },
  ".cm-content": {
    caretColor: "hsl(var(--primary))",
    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "hsl(var(--primary))",
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "hsl(var(--primary) / 0.2)",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--muted) / 0.3)",
  },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted))",
    color: "hsl(var(--muted-foreground))",
    borderRight: "1px solid hsl(var(--border))",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--muted) / 0.5)",
  },
  ".cm-placeholder": {
    color: "hsl(var(--muted-foreground))",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
});

// ---------------------------------------------------------------------------
// Markdown syntax highlighting (basic token colors)
// ---------------------------------------------------------------------------

const markdownHighlight = EditorView.theme({
  ".cm-header": { color: "hsl(var(--primary))", fontWeight: "bold" },
  ".cm-strong": { fontWeight: "bold" },
  ".cm-emphasis": { fontStyle: "italic" },
  ".cm-strikethrough": { textDecoration: "line-through" },
  ".cm-link": { color: "hsl(var(--primary))", textDecoration: "underline" },
  ".cm-url": { color: "hsl(var(--muted-foreground))" },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Insert markdown formatting syntax around the current selection.
 *
 * If text is selected, wraps it: `**selected**`. If no selection, inserts
 * the wrapper and places the cursor between: `**|**`.
 */
function wrapSelection(view: EditorView, prefix: string, suffix: string) {
  const { from, to } = view.state.selection.main;
  const selected = view.state.sliceDoc(from, to);

  if (selected.length > 0) {
    view.dispatch({
      changes: { from, to, insert: `${prefix}${selected}${suffix}` },
      selection: {
        anchor: from + prefix.length,
        head: to + prefix.length,
      },
    });
  } else {
    view.dispatch({
      changes: { from, to, insert: `${prefix}${suffix}` },
      selection: { anchor: from + prefix.length },
    });
  }
  view.focus();
}

/**
 * Estimate token count from character count.
 *
 * Uses the standard approximation of ~4 characters per token.
 */
function estimateTokens(charCount: number): number {
  return Math.ceil(charCount / 4);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Configured CodeMirror 6 editor component with markdown support.
 *
 * Provides a Luca-themed markdown editor with a formatting toolbar,
 * template variable insertion, and character/token counts. Adapts to
 * light/dark mode via CSS custom properties.
 *
 * @example
 * ```tsx
 * <CodeMirrorWrapper
 *   value={content}
 *   onChange={setContent}
 *   placeholder="Enter markdown..."
 * />
 * ```
 */
export const CodeMirrorWrapper = forwardRef<
  CodeMirrorHandle,
  CodeMirrorWrapperProps
>(function CodeMirrorWrapper(
  { value: rawValue, onChange, readOnly: rawReadOnly, placeholder, className },
  ref,
) {
  const value = rawValue ?? DEFAULT_VALUE;
  const readOnly = rawReadOnly ?? DEFAULT_READ_ONLY;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Track char count for the toolbar display
  const [charCount, setCharCount] = useState(value.length);

  // Compartments for dynamic reconfiguration
  const readOnlyCompartment = useMemo(() => new Compartment(), []);
  const placeholderCompartment = useMemo(() => new Compartment(), []);

  // ---------------------------
  // EditorView lifecycle
  // ---------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateListener = EditorView.updateListener.of(
      (update: ViewUpdate) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          setCharCount(newValue.length);
          onChangeRef.current?.(newValue);
        }
      },
    );

    const state = EditorState.create({
      doc: value,
      extensions: [
        lucaTheme,
        markdownHighlight,
        markdown(),
        EditorView.lineWrapping,
        updateListener,
        readOnlyCompartment.of(EditorState.readOnly.of(readOnly)),
        placeholderCompartment.of(
          placeholder ? placeholderExt(placeholder) : [],
        ),
        keymap.of([]),
      ],
    });

    const view = new EditorView({ state, parent: container });
    viewRef.current = view;
    setCharCount(value.length);

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only run on mount/unmount -- value syncing handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync readOnly changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: readOnlyCompartment.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly, readOnlyCompartment]);

  // Sync placeholder changes
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.reconfigure(
        placeholder ? placeholderExt(placeholder) : [],
      ),
    });
  }, [placeholder, placeholderCompartment]);

  // Sync external value changes (controlled component)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
      setCharCount(value.length);
    }
  }, [value]);

  // ---------------------------
  // Imperative handle
  // ---------------------------

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    scrollTo: (pos: number) => {
      viewRef.current?.dispatch({
        effects: EditorView.scrollIntoView(pos),
      });
    },
    getView: () => viewRef.current,
  }));

  // ---------------------------
  // Toolbar actions
  // ---------------------------

  const handleBold = useCallback(() => {
    const view = viewRef.current;
    if (view) wrapSelection(view, "**", "**");
  }, []);

  const handleItalic = useCallback(() => {
    const view = viewRef.current;
    if (view) wrapSelection(view, "*", "*");
  }, []);

  const handleCode = useCallback(() => {
    const view = viewRef.current;
    if (view) wrapSelection(view, "`", "`");
  }, []);

  const handleInsertVariable = useCallback(() => {
    const view = viewRef.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: "{{variable}}" },
      selection: { anchor: from + 2, head: from + 10 },
    });
    view.focus();
  }, []);

  // ---------------------------
  // Render
  // ---------------------------

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-border overflow-hidden",
        className,
      )}
    >
      {/* Toolbar -- hidden in readOnly mode */}
      {!readOnly && (
        <div className="flex items-center gap-1 border-b border-border bg-muted/50 px-2 py-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleBold}
            aria-label="Bold"
          >
            <Bold className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleItalic}
            aria-label="Italic"
          >
            <Italic className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={handleCode}
            aria-label="Code"
          >
            <Code className="size-3.5" />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={handleInsertVariable}
            aria-label="Insert template variable"
          >
            <Variable className="size-3.5" />
            <span>Variable</span>
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {charCount.toLocaleString()} chars
            {" / "}~{estimateTokens(charCount).toLocaleString()} tokens
          </span>
        </div>
      )}
      {/* Editor container */}
      <div ref={containerRef} className="min-h-[200px] flex-1" />
    </div>
  );
});
