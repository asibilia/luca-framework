"use client";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ShikiCodeBlock } from "~/components/shared/shiki-code-block";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiffPreviewProps = {
  /** The user's local version of the content. */
  localContent: string;
  /** The latest server version of the content. */
  serverContent: string;
  /** Called when the user chooses to keep their local changes. */
  onAcceptLocal: () => void;
  /** Called when the user chooses to accept the server version. */
  onAcceptServer: () => void;
  /** Called when the user dismisses the dialog without choosing. */
  onDismiss: () => void;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Side-by-side diff preview dialog for resolving conflicts between local
 * draft changes and server-side updates received via SSE.
 *
 * Displays the user's local content on the left and the server version on
 * the right, each in a syntax-highlighted JSON code block. The user can
 * choose to keep their local changes, accept the server version, or cancel.
 *
 * Rendered inside an AlertDialog overlay to block interaction with the
 * underlying page until a decision is made.
 *
 * @param localContent - The user's local (draft) version of the content.
 * @param serverContent - The latest version from the server.
 * @param onAcceptLocal - Callback when user clicks "Keep My Changes".
 * @param onAcceptServer - Callback when user clicks "Accept Server Version".
 * @param onDismiss - Callback when user clicks "Cancel" or closes the dialog.
 *
 * @example
 * ```tsx
 * <DiffPreview
 *   localContent={JSON.stringify(draft, null, 2)}
 *   serverContent={JSON.stringify(server, null, 2)}
 *   onAcceptLocal={() => setResolution("local")}
 *   onAcceptServer={() => setResolution("server")}
 *   onDismiss={() => setShowDiff(false)}
 * />
 * ```
 */
export function DiffPreview({
  localContent,
  serverContent,
  onAcceptLocal,
  onAcceptServer,
  onDismiss,
}: DiffPreviewProps) {
  return (
    <AlertDialog open onOpenChange={(open) => !open && onDismiss()}>
      <AlertDialogContent className="max-w-4xl sm:max-w-4xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Content Conflict</AlertDialogTitle>
          <AlertDialogDescription>
            The server content has changed while you have unsaved edits. Compare
            both versions below and choose which to keep.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Local (user's) version */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Your Changes
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-auto">
              <ShikiCodeBlock
                code={localContent}
                language="json"
                className="text-xs"
              />
            </CardContent>
          </Card>

          {/* Server version */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                Server Version
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-auto">
              <ShikiCodeBlock
                code={serverContent}
                language="json"
                className="text-xs"
              />
            </CardContent>
          </Card>
        </div>

        <AlertDialogFooter>
          <Button variant="outline" onClick={onDismiss}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={onAcceptServer}>
            Accept Server Version
          </Button>
          <Button onClick={onAcceptLocal}>Keep My Changes</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
