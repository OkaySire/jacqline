import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { ErrorBoundary } from "@/components/error-boundary";
import { useProjectsStore } from "@/stores/projects";
import { useSettingsStore } from "@/stores/settings";
import { useUiStore } from "@/stores/ui";

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
