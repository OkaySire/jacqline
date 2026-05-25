import { AboutDialog } from "@/components/about-dialog";
import { JacqlineMark } from "@/components/jacqline-mark";
import { MainPane } from "@/components/main-pane";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ProjectsSidebar } from "@/components/projects-sidebar";
import { RightPanel } from "@/components/right-panel";
import { SettingsDialog } from "@/components/settings-dialog";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

export function AppShell() {
  useKeyboardShortcuts();

  return (
    <>
      <div className="bg-background flex h-full min-h-0 w-full flex-col">
        <header className="flex shrink-0 items-center gap-3 px-6 pt-5 pb-4">
          <JacqlineMark size={40} />
          <span className="text-base font-semibold tracking-tight">Jacqline</span>
        </header>
        <div className="flex min-h-0 flex-1 gap-3 pb-6 pl-6">
          <ProjectsSidebar />
          <MainPane />
          <RightPanel />
        </div>
      </div>
      <NewProjectDialog />
      <SettingsDialog />
      <AboutDialog />
    </>
  );
}
