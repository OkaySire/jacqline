import { FilePreview } from "@/components/file-preview";
import { FileTree } from "@/components/file-tree";
import { I } from "@/components/icons";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveProject } from "@/stores/projects";
import { useFileViewerStore } from "@/stores/file-viewer";
import type { Project } from "@/types/project";

export function RightPanel() {
  const project: Project | null = useActiveProject();
  const selectedFile = useFileViewerStore((s) => s.selectedFile);

  return (
    <aside className="bg-card border-border flex w-[320px] shrink-0 flex-col rounded-l-2xl border border-r-0">
      <Tabs defaultValue="files" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="m-3 grid grid-cols-2">
          <TabsTrigger value="files" className="gap-2">
            <I.doc />
            Files
          </TabsTrigger>
          <TabsTrigger value="inspector" className="gap-2">
            <I.search />
            Inspector
          </TabsTrigger>
        </TabsList>
        <TabsContent value="files" className="flex min-h-0 flex-1 flex-col">
          {project === null ? (
            <p className="text-muted-foreground px-4 py-2 text-sm">
              Select a project to browse its files.
            </p>
          ) : selectedFile === null ? (
            <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
              <FileTree key={project.id} projectId={project.id} />
            </div>
          ) : (
            <>
              <div className="border-border/60 min-h-0 basis-2/5 overflow-auto border-b px-2 pb-2">
                <FileTree key={project.id} projectId={project.id} />
              </div>
              <div className="min-h-0 basis-3/5 px-2 py-2">
                <FilePreview />
              </div>
            </>
          )}
        </TabsContent>
        <TabsContent value="inspector" className="flex-1 px-4 py-3">
          <p className="text-muted-foreground text-sm">Project inspector coming in Phase 5+.</p>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
