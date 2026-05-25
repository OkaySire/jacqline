import { CustomizeWindow } from "@/components/customize-window";
import { Inspector } from "@/components/inspector";
import { MainPane } from "@/components/main-pane";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectConfigWindow } from "@/components/project-config-window";
import { SessionDialog } from "@/components/session-dialog";
import { Sidebar } from "@/components/sidebar";
import { TitleBar } from "@/components/title-bar";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
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

  return (
    <>
      <div
        className="jq-app-frame"
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
          <MainPane />
          {!inspectorHidden && <Inspector />}
        </div>
      </div>
      <NewProjectDialog />
      <SessionDialog />
      <CustomizeWindow />
      <ProjectConfigWindow />
    </>
  );
}
