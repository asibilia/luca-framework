import { Settings } from "lucide-react";

import { PageContainer } from "~/components/layout/page-container";

/**
 * Settings page stub.
 *
 * Will provide application-level settings for Luca Studio including
 * theme preferences, connection configuration, display options,
 * and keyboard shortcut customization. Content coming in a future phase.
 */
export default function SettingsPage() {
  return (
    <PageContainer title="Settings" subtitle="Application preferences">
      <div className="flex flex-col items-center justify-center gap-4 py-24 text-muted-foreground">
        <Settings className="size-12 opacity-30" />
        <p className="font-mono text-sm">Under construction</p>
        <p className="max-w-md text-center text-xs text-muted-foreground/60">
          This page will provide application-level settings including theme
          preferences, connection configuration, display options, and keyboard
          shortcut customization.
        </p>
      </div>
    </PageContainer>
  );
}
