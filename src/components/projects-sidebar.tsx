import { Folder, Plus } from "lucide-react";

import { JacqlineMark } from "@/components/jacqline-mark";
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
    <aside className="bg-card border-border flex w-60 shrink-0 flex-col border-r">
      <header className="border-border flex items-center gap-2 border-b px-4 py-3">
        <JacqlineMark size={28} />
        <span className="font-semibold tracking-tight">Jacqline</span>
      </header>
      <div className="flex-1 overflow-y-auto p-2">
        {loading && projects.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-muted-foreground p-2 text-sm">No projects yet.</p>
        ) : (
          <ul className="space-y-0.5">
            {projects.map((p: Project) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={cn(
                    "hover:bg-popover flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    activeId === p.id && "bg-popover text-foreground",
                  )}
                  onClick={() => setActive(p.id)}
                >
                  <Folder className="text-muted-foreground size-4 shrink-0" />
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
