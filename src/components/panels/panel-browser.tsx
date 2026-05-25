import { I } from "@/components/icons";

interface PanelBrowserProps {
  readonly url?: string;
}

/**
 * Web preview panel — V0.2 wires a real Tauri webview child to render an
 * arbitrary URL (default = `project.preview.url` from the per-project config).
 * Phase G ships the placeholder shell so the tab can be added and the UX is
 * discoverable.
 */
export function PanelBrowser({ url = "" }: PanelBrowserProps) {
  return (
    <div className="text-fg-3 flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <I.globe style={{ width: 32, height: 32 }} className="text-fg-3/70" />
      <p className="text-fg-1 text-sm">Web preview panel</p>
      <p className="text-fg-3 max-w-xs text-xs">
        Embedded browser arrives in V0.2 — it will render the URL configured in the project
        preferences ({url === "" ? "no URL set" : url}).
      </p>
    </div>
  );
}
