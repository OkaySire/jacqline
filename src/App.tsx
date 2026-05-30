import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore } from "@/stores/sessions";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";

interface ClaudeMetadataPayload {
  readonly sessionId: string;
  readonly claudeSessionId: string;
  readonly claudeVersion: string;
}

function App() {
  const hydrateProjects = useProjectsStore((s) => s.hydrate);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const projectsHydrated = useProjectsStore(
    (s) => !s.loading && s.error === null && s.projects.length === 0,
  );
  const settingsHydrated = useSettingsStore((s) => s.hydrated);
  const openNewProject = useUiStore((s) => s.openNewProject);

  // Hydrate persistent state once on mount.
  useEffect(() => {
    void hydrateProjects();
    void hydrateSettings();
  }, [hydrateProjects, hydrateSettings]);

  // Subscribe to `session_meta_updated` events fired by the Rust
  // `claude_watch` task whenever it picks up a new Claude session's
  // JSONL transcript. Single global listener — the sessionId in the
  // payload demultiplexes across all live sessions.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed: boolean = false;
    void listen<ClaudeMetadataPayload>("session_meta_updated", (event) => {
      const { sessionId, claudeSessionId, claudeVersion } = event.payload;
      useSessionsStore.getState().applyClaudeMetadata(sessionId, claudeSessionId, claudeVersion);
    }).then((fn: UnlistenFn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      disposed = true;
      if (unlisten !== null) {
        unlisten();
      }
    };
  }, []);

  // First-run experience: if everything is loaded and we still have zero
  // projects, drop the user straight into the "New project" dialog.
  useEffect(() => {
    if (settingsHydrated && projectsHydrated) {
      openNewProject();
    }
  }, [settingsHydrated, projectsHydrated, openNewProject]);

  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}

export default App;
