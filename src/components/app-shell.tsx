import { useState } from "react";

import { JacqlineMark } from "@/components/jacqline-mark";
import { MainPane } from "@/components/main-pane";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectsSidebar } from "@/components/projects-sidebar";
import { RightPanel } from "@/components/right-panel";

export function AppShell() {
  const [newProjectOpen, setNewProjectOpen] = useState<boolean>(false);

  return (
    <>
      <div className="bg-background flex h-full min-h-0 w-full flex-col">
        <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-4">
          <JacqlineMark size={40} />
          <span className="text-base font-semibold tracking-tight">Jacqline</span>
        </header>
        <div className="flex min-h-0 flex-1 gap-3 pb-6 pl-6">
          <ProjectsSidebar onNewProject={() => setNewProjectOpen(true)} />
          <MainPane />
          <RightPanel />
        </div>
      </div>
      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
    </>
  );
}
