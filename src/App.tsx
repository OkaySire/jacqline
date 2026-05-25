import { useEffect } from "react";

import { AppShell } from "@/components/app-shell";
import { useProjectsStore } from "@/stores/projects";

function App() {
  const hydrate = useProjectsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  return <AppShell />;
}

export default App;
