import { useEffect } from "react";

import { useActiveProject, useProjectsStore } from "@/stores/projects";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";

/**
 * Wires up the MVP keyboard shortcuts (CLAUDE.md spec L153–157):
 *
 * - `Mod+N` — open New Project dialog
 * - `Mod+1..9` — switch to the Nth project in the sidebar
 * - `Mod+W` — kill the active project's session
 * - `Mod+R` — restart the active project's session
 *
 * `Mod` is `⌘` on macOS, `Ctrl` elsewhere. Each binding calls `preventDefault`
 * so we don't fall through to the browser/Tauri default (Cmd+R reload, Cmd+W
 * close window, etc.).
 */
export function useKeyboardShortcuts(): void {
  const openNewProject = useUiStore((s) => s.openNewProject);
  const projects = useProjectsStore((s) => s.projects);
  const setActive = useProjectsStore((s) => s.setActive);
  const activeProject = useActiveProject();
  const killSession = useSessionsStore((s) => s.killSession);
  const ensureSession = useSessionsStore((s) => s.ensureSession);
  const clearExit = useSessionsStore((s) => s.clearExit);

  useEffect(() => {
    function handler(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }
      if (event.altKey || event.shiftKey) {
        return;
      }

      const key: string = event.key.toLowerCase();

      if (key === "n") {
        event.preventDefault();
        openNewProject();
        return;
      }
      if (key === "w" && activeProject !== null) {
        event.preventDefault();
        void killSession(activeProject.id).catch((err: unknown) => {
          console.error("killSession failed", err);
        });
        return;
      }
      if (key === "r" && activeProject !== null) {
        event.preventDefault();
        const projectId: string = activeProject.id;
        void (async () => {
          try {
            await killSession(projectId);
            clearExit(projectId);
            await ensureSession(projectId);
          } catch (err: unknown) {
            console.error("restart session failed", err);
          }
        })();
        return;
      }

      // Mod+1..9 → activate the Nth project (1-indexed) from the sidebar list.
      if (event.key >= "1" && event.key <= "9") {
        const idx: number = Number.parseInt(event.key, 10) - 1;
        const project = projects[idx];
        if (project !== undefined) {
          event.preventDefault();
          setActive(project.id);
        }
      }
    }

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [openNewProject, projects, setActive, activeProject, killSession, ensureSession, clearExit]);
}
