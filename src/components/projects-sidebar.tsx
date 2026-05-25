import { Folder, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/stores/projects";
import type { Project } from "@/types/project";

interface ProjectsSidebarProps {
  readonly onNewProject: () => void;
}

export function ProjectsSidebar({ onNewProject }: ProjectsSidebarProps) {
  const projects: readonly Project[] = useProjectsStore((s) => s.projects);
  const activeId: string | null = useProjectsStore((s) => s.activeProjectId);
  const setActive: (id: string | null) => void = useProjectsStore((s) => s.setActive);
  const loading: boolean = useProjectsStore((s) => s.loading);

  return (
    <aside className="bg-card border-border flex w-[220px] shrink-0 flex-col rounded-2xl border">
      <div className="flex-1 overflow-y-auto p-3">
        {loading && projects.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">No projects yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {projects.map((p: Project) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={cn(
                    "flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors",
                    activeId === p.id
                      ? "bg-primary/25 text-foreground"
                      : "bg-popover/60 text-foreground/90 hover:bg-popover",
                  )}
                  onClick={() => setActive(p.id)}
                >
                  <Folder
                    className={cn(
                      "size-3.5 shrink-0",
                      activeId === p.id ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-border border-t p-3">
        <Button onClick={onNewProject} className="w-full">
          <Plus className="size-4" />
          New project
        </Button>
      </div>
    </aside>
  );
}
