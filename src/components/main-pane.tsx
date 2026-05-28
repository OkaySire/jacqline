import { useEffect, useMemo } from "react";

import { Statusbar } from "@/components/statusbar";
import { Terminal } from "@/components/terminal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/stores/projects";
import { useActiveSession, useSessionsStore, type SessionExitInfo } from "@/stores/sessions";
import type { Project } from "@/types/project";
import type { SessionMeta } from "@/types/session";

export function MainPane() {
  const project: Project | null = useActiveProject();
  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);
  const lastExitByProject = useSessionsStore((s) => s.lastExitByProject);
  const ensureSession = useSessionsStore((s) => s.ensureSession);
  const createSession = useSessionsStore((s) => s.createSession);
  const restartSession = useSessionsStore((s) => s.restartSession);
  const loadProjectSessions = useSessionsStore((s) => s.loadProjectSessions);
  const clearExit = useSessionsStore((s) => s.clearExit);
  const activeSession: SessionMeta | null = useActiveSession(project?.id ?? null);

  // On project switch: hydrate that project's sessions from SQL. ONLY
  // auto-spawn when the project has no sessions at all — once the user
  // has any session (even stopped ones from a previous run), they get
  // to choose explicitly when to spawn a new one via the sidebar's
  // "Nouvelle session" button, and clicking an existing row just
  // changes the active session without side-effects.
  useEffect(() => {
    if (project === null) {
      return;
    }
    const projectId: string = project.id;
    void (async () => {
      try {
        await loadProjectSessions(projectId);
      } catch (err: unknown) {
        console.error("loadProjectSessions failed", err);
        return;
      }
      const state = useSessionsStore.getState();
      if (state.lastExitByProject.has(projectId)) {
        return;
      }
      const sessions = state.sessionsByProject.get(projectId) ?? [];
      if (sessions.length > 0) {
        return;
      }
      try {
        await ensureSession(projectId);
      } catch (err: unknown) {
        console.error("ensureSession failed", err);
      }
    })();
  }, [project, ensureSession, loadProjectSessions]);

  // All currently-running sessions across all projects. Each gets a hidden
  // `<Terminal>` mount so scrollback survives switching project / session.
  const runningSessions: readonly SessionMeta[] = useMemo(() => {
    const out: SessionMeta[] = [];
    for (const [, sessions] of sessionsByProject) {
      for (const session of sessions) {
        if (session.status === "running") {
          out.push(session);
        }
      }
    }
    return out;
  }, [sessionsByProject]);

  if (project === null) {
    return (
      <section className="jq-content jq-content-empty">
        <p className="jq-empty-msg">Select a project or create a new one.</p>
      </section>
    );
  }

  const lastExit: SessionExitInfo | undefined = lastExitByProject.get(project.id);
  const activeIsRunning: boolean = activeSession?.status === "running";
  const activeIsStopped: boolean = activeSession?.status === "stopped";

  return (
    <section className="jq-content">
      <div className="jq-xterm-wrap">
        {runningSessions.map((session: SessionMeta) => (
          <div
            key={session.id}
            className={cn(
              "absolute inset-0",
              (!activeIsRunning || session.id !== activeSession?.id) && "hidden",
            )}
          >
            <Terminal sessionId={session.id} />
          </div>
        ))}

        {activeSession === null && lastExit === undefined && <SpawningState />}

        {activeIsStopped && activeSession !== null && (
          <ExitedBanner
            exit={{
              sessionId: activeSession.id,
              code: lastExit?.sessionId === activeSession.id ? lastExit.code : 0,
            }}
            onRestart={() => {
              clearExit(project.id);
              void restartSession(activeSession.id).catch((err: unknown) => {
                console.error("restartSession failed", err);
              });
            }}
            onOpenShell={() => {
              clearExit(project.id);
              void restartSession(activeSession.id, false).catch((err: unknown) => {
                console.error("restartSession (shell) failed", err);
                void createSession(project.id, "shell", false).catch((err2: unknown) => {
                  console.error("createSession (shell fallback) failed", err2);
                });
              });
            }}
          />
        )}

        {activeSession === null && lastExit !== undefined && (
          <ExitedBanner
            exit={lastExit}
            onRestart={() => {
              clearExit(project.id);
              void restartSession(lastExit.sessionId).catch((err: unknown) => {
                console.error("restartSession failed", err);
                void ensureSession(project.id).catch((err2: unknown) => {
                  console.error("ensureSession failed", err2);
                });
              });
            }}
            onOpenShell={() => {
              clearExit(project.id);
              void restartSession(lastExit.sessionId, false).catch((err: unknown) => {
                console.error("restartSession (shell) failed", err);
                void createSession(project.id, "shell", false).catch((err2: unknown) => {
                  console.error("createSession (shell fallback) failed", err2);
                });
              });
            }}
          />
        )}
      </div>
      <Statusbar project={project} session={activeSession} />
    </section>
  );
}

function SpawningState() {
  return (
    <div className="bg-card/30 border-line-soft absolute inset-4 flex items-center justify-center rounded-lg border border-dashed">
      <p className="text-fg-2 text-sm">Spawning session…</p>
    </div>
  );
}

function ExitedBanner({
  exit,
  onRestart,
  onOpenShell,
}: {
  readonly exit: SessionExitInfo;
  readonly onRestart: () => void;
  readonly onOpenShell: () => void;
}) {
  const isError: boolean = exit.code === null || exit.code !== 0;
  const codeLabel: string = exit.code === null ? " (killed)" : ` with code ${exit.code}`;
  return (
    <div className="bg-card/30 border-line-soft absolute inset-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-8 text-center">
      <p className={isError ? "text-destructive text-sm" : "text-fg-2 text-sm"}>
        Session exited{codeLabel}.
      </p>
      {isError && (
        <p className="text-fg-3 max-w-md text-xs">
          The most common cause is <code className="font-mono">claude</code> not being on the
          shell's PATH (login shells don't always source <code className="font-mono">.bashrc</code>
          ). Restart to retry, or open a plain shell to debug.
        </p>
      )}
      <div className="flex items-center gap-2">
        <Button onClick={onRestart}>Restart session</Button>
        {isError && (
          <Button variant="ghost" onClick={onOpenShell}>
            Open shell instead
          </Button>
        )}
      </div>
    </div>
  );
}
