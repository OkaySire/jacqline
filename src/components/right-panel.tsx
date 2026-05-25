import { FileSearch, FileText } from "lucide-react";

import { FileTree } from "@/components/file-tree";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveProject } from "@/stores/projects";
import type { Project } from "@/types/project";

export function RightPanel() {
  const project: Project | null = useActiveProject();

  return (
    <aside className="bg-card border-border flex w-[320px] shrink-0 flex-col rounded-l-2xl border border-r-0">
      <Tabs defaultValue="files" className="flex flex-1 flex-col">
        <TabsList className="m-3 grid grid-cols-2">
          <TabsTrigger value="files" className="gap-2">
            <FileText className="size-4" />
            Files
          </TabsTrigger>
          <TabsTrigger value="inspector" className="gap-2">
            <FileSearch className="size-4" />
            Inspector
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="flex-1 overflow-y-auto px-2 pb-3">
          {project === null ? (
            <p className="text-muted-foreground px-2 py-1 text-sm">
              Select a project to browse its files.
            </p>
          ) : (
            <FileTree key={project.id} projectId={project.id} />
          )}
        </TabsContent>
        <TabsContent value="inspector" className="flex-1 px-4 py-3">
          <p className="text-muted-foreground text-sm">Project inspector coming in Phase 5+.</p>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
