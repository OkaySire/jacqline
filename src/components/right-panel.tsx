import { FileSearch, FileText } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function RightPanel() {
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
        <TabsContent value="files" className="flex-1 px-4 py-3">
          <p className="text-muted-foreground text-sm">File browser coming in Phase 5.</p>
        </TabsContent>
        <TabsContent value="inspector" className="flex-1 px-4 py-3">
          <p className="text-muted-foreground text-sm">Project inspector coming in Phase 5+.</p>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
