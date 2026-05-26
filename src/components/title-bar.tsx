import { getCurrentWindow } from "@tauri-apps/api/window";

import { I } from "@/components/icons";
import { JacqlineMark } from "@/components/jacqline-mark";
import { SystemMenu } from "@/components/system-menu";
import { UpdateNotice } from "@/components/update-notice";
import { useUiStore } from "@/stores/ui";

/**
 * Custom titlebar. The Tauri window has `decorations: false` so we own the
 * frame entirely; the OS still handles edge-resize for us.
 *
 * The header element carries `data-tauri-drag-region` so the user can grab any
 * empty area to move the window. Tauri excludes interactive elements
 * (`button`, `a`, `input`) from the drag region automatically — the explicit
 * `data-tauri-drag-region={false}` on the brand wrapper is belt-and-braces in
 * case some descendants get added later.
 */
export function TitleBar() {
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUiStore((s) => s.toggleSidebar);

  function onMinimize(): void {
    void getCurrentWindow()
      .minimize()
      .catch((err: unknown) => console.error("minimize failed", err));
  }
  function onToggleMaximize(): void {
    void getCurrentWindow()
      .toggleMaximize()
      .catch((err: unknown) => console.error("toggleMaximize failed", err));
  }
  function onClose(): void {
    void getCurrentWindow()
      .close()
      .catch((err: unknown) => console.error("close failed", err));
  }

  return (
    <header className="jq-titlebar" data-tauri-drag-region>
      <div className="jq-tb-left">
        <button type="button" className="jq-tb-btn" aria-label="Menu">
          <I.menu />
        </button>
        <button
          type="button"
          className="jq-tb-btn"
          onClick={toggleSidebar}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <I.panel_right /> : <I.panel_left />}
        </button>
        <div className="jq-tb-brand">
          <JacqlineMark size={18} />
          <span>Jacqline</span>
        </div>
      </div>
      <div className="jq-tb-center" />
      <div className="jq-tb-right">
        <UpdateNotice />
        <SystemMenu />
        <div className="jq-tb-divider" />
        <button type="button" className="jq-tb-btn" onClick={onMinimize} title="Minimize">
          <I.min />
        </button>
        <button type="button" className="jq-tb-btn" onClick={onToggleMaximize} title="Maximize">
          <I.max />
        </button>
        <button type="button" className="jq-tb-btn close" onClick={onClose} title="Close">
          <I.close />
        </button>
      </div>
    </header>
  );
}
