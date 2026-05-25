import { Terminal } from "lucide-react";

import { useActiveProject } from "@/stores/projects";
import type { Project } from "@/types/project";

export function MainPane() {
  const project: Project | null = useActiveProject();

  if (project === null) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <Terminal className="text-muted-foreground/40 size-12" />
        <p className="text-muted-foreground">Select a project or create a new one.</p>
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="border-border flex items-center gap-3 border-b px-4 py-3">
        <Terminal className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate font-medium tracking-tight">{project.name}</h2>
          <p className="text-muted-foreground truncate font-mono text-xs">{project.cwd}</p>
        </div>
      </header>
      <div className="bg-popover/30 border-border m-4 flex flex-1 items-center justify-center rounded-lg border border-dashed">
        <p className="text-muted-foreground">Terminal coming in Phase 4.</p>
      </div>
    </section>
  );
}
