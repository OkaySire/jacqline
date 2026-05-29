import type { CSSProperties } from "react";

import { CustomizeWindow } from "@/components/customize-window";
import { Inspector } from "@/components/inspector";
import { InspectorResizer } from "@/components/inspector-resizer";
import { MainPane } from "@/components/main-pane";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectConfigWindow } from "@/components/project-config-window";
import { SessionDialog } from "@/components/session-dialog";
import { Sidebar } from "@/components/sidebar";
import { TitleBar } from "@/components/title-bar";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";

/**
 * App-frame grid: titlebar row on top + main grid (sidebar | content |
 * inspector). The `data-sb` / `data-inspector` attributes flip the
 * `grid-template-columns` of `.jq-main` from CSS (see `src/index.css`).
 *
 * Phase C lands the new structural shell + custom TitleBar (window
 * `decorations: false`). The Sidebar / MainPane / Inspector internals keep
 * their existing classes — they're refactored to the mockup's `.jq-sidebar /
 * .jq-content / .jq-inspector` styles in phases D / E / G respectively.
 */
export function AppShell() {
  useKeyboardShortcuts();
  const sidebarCollapsed = useUiStore((s) => s.sidebarCollapsed);
  const inspectorHidden = useUiStore((s) => s.inspectorHidden);
  const openNewProject = useUiStore((s) => s.openNewProject);
  const openCustomize = useUiStore((s) => s.openCustomize);
  const openProjectConfig = useUiStore((s) => s.openProjectConfig);
  const openNewSession = useUiStore((s) => s.openNewSession);
  const openEditSession = useUiStore((s) => s.openEditSession);
  const inspectorWidth = useSettingsStore((s) => s.inspectorWidth);

  // Inject inspector width as a CSS variable on the app frame so the
  // `.jq-main` grid template picks it up. InspectorResizer mutates this
  // value directly on the DOM node during drag to avoid per-pixel React
  // re-renders; on mouseup the settings store commits the final value
  // and this inline style re-applies the same value with no visual jump.
  const frameStyle = { "--jq-inspector-w": `${String(inspectorWidth)}px` } as CSSProperties;

  return (
    <>
      <div
        className="jq-app-frame"
        style={frameStyle}
        data-sb={sidebarCollapsed ? "collapsed" : "expanded"}
        data-inspector={inspectorHidden ? "hidden" : "shown"}
      >
        <TitleBar />
        <div className="jq-main">
          <Sidebar
            onOpenCustomize={openCustomize}
            onNewProject={openNewProject}
            onNewSession={openNewSession}
            onEditSession={openEditSession}
            onOpenProjectConfig={openProjectConfig}
          />
          {/*
           * CSS-grid track placeholders. The `.jq-main` grid has 5 explicit
           * tracks (sidebar | gap | content | flush | inspector); auto-flow
           * places children sequentially into the cells, so we need an empty
           * div for each "non-component" track or the content would land in
           * the gap and the inspector in the content track. Mirrors the
           * mockup's `<SidebarResizer />` / `<InspectorResizer />` placement.
           * When the matching panel is hidden, the gap track is removed from
           * the grid template (see `index.css`) and the placeholder isn't
           * rendered either.
           */}
          {!sidebarCollapsed && <div className="jq-track-spacer" aria-hidden />}
          <MainPane />
          {!inspectorHidden && (
            <>
              <InspectorResizer />
              <Inspector />
            </>
          )}
        </div>
      </div>
      <NewProjectDialog />
      <SessionDialog />
      <CustomizeWindow />
      <ProjectConfigWindow />
    </>
  );
}
