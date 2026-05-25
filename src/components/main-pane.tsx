import { Terminal as TerminalIcon } from "lucide-react";
import { useEffect } from "react";

import { Terminal } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/stores/projects";
import { useSessionsStore, type SessionExitInfo } from "@/stores/sessions";
import type { Project } from "@/types/project";
import type { SessionMeta } from "@/types/session";

export function MainPane() {
  const project: Project | null = useActiveProject();
  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);
  const lastExitByProject = useSessionsStore((s) => s.lastExitByProject);
  const ensureSession = useSessionsStore((s) => s.ensureSession);
  const clearExit = useSessionsStore((s) => s.clearExit);

  // Auto-spawn a session whenever a project becomes active without one — but
  // only if its previous session didn't just exit (we'd otherwise loop on the
  // restart banner). Restarting is an explicit user action.
  useEffect(() => {
    if (project === null) {
      return;
    }
    if (sessionsByProject.has(project.id)) {
      return;
    }
    if (lastExitByProject.has(project.id)) {
      return;
    }
    void ensureSession(project.id).catch((err: unknown) => {
      console.error("ensureSession failed", err);
    });
  }, [project, sessionsByProject, lastExitByProject, ensureSession]);

  if (project === null) {
    return (
      <section className="bg-popover border-border flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-2xl border p-8 text-center">
        <TerminalIcon className="text-muted-foreground/40 size-12" />
        <p className="text-muted-foreground">Select a project or create a new one.</p>
      </section>
    );
  }

  const activeSession: SessionMeta | undefined = sessionsByProject.get(project.id);
  const lastExit: SessionExitInfo | undefined = lastExitByProject.get(project.id);

  return (
    <section className="bg-popover border-border flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border">
      <header className="border-border/60 flex items-center gap-3 border-b px-4 py-3">
        <TerminalIcon className="text-muted-foreground size-4 shrink-0" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-medium tracking-tight">{project.name}</h2>
          <p className="text-muted-foreground truncate font-mono text-xs">{project.cwd}</p>
        </div>
      </header>
      <div className="relative flex-1">
        {/* All live terminals are mounted; only the active one is visible.
            Hidden terminals keep their xterm instance + scrollback alive. */}
        {Array.from(sessionsByProject.entries()).map(([projectId, meta]: [string, SessionMeta]) => (
          <div
            key={meta.id}
            className={cn("absolute inset-0", projectId !== project.id && "hidden")}
          >
            <Terminal sessionId={meta.id} />
          </div>
        ))}

        {activeSession === undefined && lastExit === undefined && <SpawningState />}

        {activeSession === undefined && lastExit !== undefined && (
          <ExitedBanner
            exit={lastExit}
            onRestart={() => {
              clearExit(project.id);
              void ensureSession(project.id).catch((err: unknown) => {
                console.error("ensureSession failed", err);
              });
            }}
          />
        )}
      </div>
    </section>
  );
}

function SpawningState() {
  return (
    <div className="bg-card/40 border-border absolute inset-4 flex items-center justify-center rounded-lg border border-dashed">
      <p className="text-muted-foreground text-sm">Spawning session…</p>
    </div>
  );
}

function ExitedBanner({
  exit,
  onRestart,
}: {
  readonly exit: SessionExitInfo;
  readonly onRestart: () => void;
}) {
  const isError: boolean = exit.code === null || exit.code !== 0;
  const codeLabel: string = exit.code === null ? " (killed)" : ` with code ${exit.code}`;
  return (
    <div className="bg-card/40 border-border absolute inset-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <p className={isError ? "text-destructive text-sm" : "text-muted-foreground text-sm"}>
        Session exited{codeLabel}.
      </p>
      {isError && (
        <p className="text-muted-foreground max-w-md text-xs">
          If you didn't see <code className="font-mono">claude</code> start, make sure the provider
          command is on your PATH and try again.
        </p>
      )}
      <Button onClick={onRestart}>Restart session</Button>
    </div>
  );
}
