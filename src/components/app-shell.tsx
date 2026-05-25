import { AboutDialog } from "@/components/about-dialog";
import { MainPane } from "@/components/main-pane";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { RightPanel } from "@/components/right-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { Sidebar } from "@/components/sidebar";
import { TitleBar } from "@/components/title-bar";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useSessionsStore } from "@/stores/sessions";
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
  const openSettings = useUiStore((s) => s.openSettings);
  const createSession = useSessionsStore((s) => s.createSession);

  // Customize / ProjectConfig / Edit-session windows live in Phase F. For
  // Phase D we wire Customize to the existing Settings dialog (close-enough
  // surrogate for the visible click target) and leave the other two as
  // no-ops; the kebab items are rendered but disabled where they'd open the
  // unimplemented modals.
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
            onOpenCustomize={openSettings}
            onNewProject={openNewProject}
            onNewSession={(projectId: string) => {
              void createSession(projectId).catch((err: unknown) => {
                console.error("createSession failed", err);
              });
            }}
            onEditSession={() => {
              /* SessionDialog edit mode — Phase F */
            }}
            onOpenProjectConfig={() => {
              /* ProjectConfigWindow — Phase F */
            }}
          />
          <MainPane />
          {!inspectorHidden && <RightPanel />}
        </div>
      </div>
      <NewProjectDialog />
      <SettingsDialog />
      <AboutDialog />
    </>
  );
}
