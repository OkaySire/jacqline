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

  // On project switch: hydrate that project's sessions from SQL, then
  // auto-spawn one if it has none live and didn't just crash.
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
      if (useSessionsStore.getState().lastExitByProject.has(projectId)) {
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

  return (
    <section className="jq-content">
      <div className="jq-xterm-wrap">
        {runningSessions.map((session: SessionMeta) => (
          <div
            key={session.id}
            className={cn("absolute inset-0", session.id !== activeSession?.id && "hidden")}
          >
            <Terminal sessionId={session.id} />
          </div>
        ))}

        {activeSession === null && lastExit === undefined && <SpawningState />}

        {activeSession === null && lastExit !== undefined && (
          <ExitedBanner
            exit={lastExit}
            onRestart={() => {
              clearExit(project.id);
              // Restart the failed session if we know which one it was, so
              // the user keeps the same name + id. Falls back to
              // ensureSession when the lastExit entry has been cleared
              // already (rare race).
              void restartSession(lastExit.sessionId).catch((err: unknown) => {
                console.error("restartSession failed", err);
                void ensureSession(project.id).catch((err2: unknown) => {
                  console.error("ensureSession failed", err2);
                });
              });
            }}
            onOpenShell={() => {
              clearExit(project.id);
              // Re-spawn the same row but skip the `claude` invocation —
              // gives the user a plain shell so they can debug why
              // `claude` isn't on the PATH.
              void restartSession(lastExit.sessionId, false).catch((err: unknown) => {
                console.error("restartSession (shell) failed", err);
                // If the restart fails (e.g. row was deleted), fall back
                // to a fresh shell-only session under a new id.
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
