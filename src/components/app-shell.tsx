import { useState } from "react";

import { MainPane } from "@/components/main-pane";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectsSidebar } from "@/components/projects-sidebar";
import { RightPanel } from "@/components/right-panel";

export function AppShell() {
  const [newProjectOpen, setNewProjectOpen] = useState<boolean>(false);

  return (
    <>
      <div className="flex h-full min-h-0 w-full">
        <ProjectsSidebar onNewProject={() => setNewProjectOpen(true)} />
        <MainPane />
        <RightPanel />
      </div>
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </>
  );
}
