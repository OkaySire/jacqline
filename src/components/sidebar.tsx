import { useCallback, useEffect, useState, type MouseEvent } from "react";

import { I } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore } from "@/stores/sessions";
import type { Project } from "@/types/project";
import type { SessionMeta } from "@/types/session";

/**
 * Project sidebar — top action buttons (Nouveau projet + Customize) above a
 * collapsible tree of projects. Each project expands into its list of
 * sessions (running / idle / stopped) with status dots, per-session edit and
 * play/stop affordances, and a "Nouvelle session" footer.
 *
 * Style classes are mirrored 1:1 from the mockup (`jq-sidebar` /
 * `jq-sb-*` / `jq-project*` / `jq-session*`). Layout is grid-driven from
 * `src/index.css`.
 *
 * Modal handlers (`onOpenCustomize`, `onOpenProjectConfig`, `onEditSession`)
 * are wired by `AppShell` — Phase F replaces today's Settings/About dialogs
 * with the dedicated Customize / ProjectConfig / SessionDialog windows. For
 * Phase D the props are present but `onOpenProjectConfig` and `onEditSession`
 * are wired to a no-op (the kebab menu items still render, they just don't
 * fire anything yet).
 */
interface SidebarProps {
  readonly onOpenCustomize: () => void;
  readonly onNewProject: () => void;
  readonly onNewSession: (projectId: string) => void;
  readonly onEditSession: (projectId: string, sessionId: string) => void;
  readonly onOpenProjectConfig: (projectId: string) => void;
}

const PROJECT_PALETTE: readonly string[] = [
  "oklch(0.66 0.18 295)", // violet
  "oklch(0.66 0.18 25)", // coral
  "oklch(0.74 0.14 80)", // amber
  "oklch(0.66 0.16 150)", // green
  "oklch(0.66 0.16 230)", // sky
  "oklch(0.66 0.16 320)", // pink
];

function hashString(input: string): number {
  let hash: number = 0;
  for (let i: number = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) & 0xffff;
  }
  return hash;
}

function projectColor(project: Project): string {
  const idx: number = hashString(project.id) % PROJECT_PALETTE.length;
  return PROJECT_PALETTE[idx] ?? PROJECT_PALETTE[0]!;
}

function projectInitial(project: Project): string {
  const trimmed: string = project.name.trim();
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : "·";
}

function shortenClaudeId(claudeId: string): string {
  if (claudeId === "") {
    return "";
  }
  return claudeId.replace(/^sess_/, "");
}

export function Sidebar({
  onOpenCustomize,
  onNewProject,
  onNewSession,
  onEditSession,
  onOpenProjectConfig,
}: SidebarProps) {
  const projects: readonly Project[] = useProjectsStore((s) => s.projects);
  const activeProjectId: string | null = useProjectsStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsStore((s) => s.setActive);
  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);
  const activeSessionByProject = useSessionsStore((s) => s.activeSessionByProject);
  const setActiveSession = useSessionsStore((s) => s.setActiveSession);
  const killSession = useSessionsStore((s) => s.killSession);
  const createSession = useSessionsStore((s) => s.createSession);
  const loadProjectSessions = useSessionsStore((s) => s.loadProjectSessions);

  // Load every known project's session list when the projects array changes
  // (initial hydration, new project added). `loadProjectSessions` coalesces
  // concurrent requests for the same projectId so this is cheap on re-runs.
  useEffect(() => {
    for (const project of projects) {
      void loadProjectSessions(project.id).catch((err: unknown) => {
        console.error("loadProjectSessions failed", err);
      });
    }
  }, [projects, loadProjectSessions]);

  const [openProjects, setOpenProjects] = useState<ReadonlySet<string>>(() => {
    return activeProjectId !== null ? new Set([activeProjectId]) : new Set();
  });
  const toggleOpen = useCallback((projectId: string): void => {
    setOpenProjects((prev: ReadonlySet<string>) => {
      const next: Set<string> = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  // Open kebab menu state — single menu at a time, closes on outside click.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  useEffect(() => {
    if (menuFor === null) {
      return;
    }
    const onDoc = (): void => {
      setMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
    };
  }, [menuFor]);

  return (
    <aside className="jq-sidebar">
      <div className="jq-sb-top">
        <button
          type="button"
          className="jq-sb-action primary"
          onClick={onNewProject}
          data-tip="Nouveau projet"
        >
          <I.plus />
          <span className="label">Nouveau projet</span>
        </button>
        <button
          type="button"
          className="jq-sb-action"
          onClick={onOpenCustomize}
          data-tip="Customize"
        >
          <I.sparkle />
          <span className="label">Customize</span>
        </button>
      </div>

      <div className="jq-sb-section">
        <div className="jq-sb-heading">
          <span>Projets</span>
          <button type="button" title="Nouveau projet" onClick={onNewProject}>
            <I.plus />
          </button>
        </div>

        {projects.length === 0 && (
          <p className="jq-sb-empty">No projects yet — create one above.</p>
        )}

        {projects.map((project: Project) => {
          const isOpen: boolean = openProjects.has(project.id);
          const sessions: readonly SessionMeta[] = sessionsByProject.get(project.id) ?? [];
          const activeSessionId: string | undefined = activeSessionByProject.get(project.id);
          const hasRunning: boolean = sessions.some((s: SessionMeta) => s.status === "running");
          const color: string = projectColor(project);

          return (
            <div
              key={project.id}
              className="jq-project"
              data-open={isOpen ? "true" : "false"}
              data-has-running={hasRunning ? "true" : "false"}
            >
              <div
                className={cn("jq-project-row", project.id === activeProjectId && "active")}
                onClick={() => {
                  setActiveProject(project.id);
                  if (!isOpen) {
                    toggleOpen(project.id);
                  }
                }}
                data-tip={project.name}
              >
                <button
                  type="button"
                  className="jq-project-chev"
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    toggleOpen(project.id);
                  }}
                  aria-label={isOpen ? "Collapse project" : "Expand project"}
                >
                  <I.chev />
                </button>
                <span className="name">
                  <span
                    className="jq-project-icon"
                    style={{
                      background: `${color.slice(0, -1)} / 0.25)`,
                      color,
                      borderColor: `${color.slice(0, -1)} / 0.4)`,
                    }}
                  >
                    {projectInitial(project)}
                  </span>
                  <span className="jq-project-name-text">{project.name}</span>
                </span>
                <button
                  type="button"
                  className={cn("jq-kebab", menuFor === project.id && "active")}
                  onClick={(e: MouseEvent) => {
                    e.stopPropagation();
                    setMenuFor(menuFor === project.id ? null : project.id);
                  }}
                  title="Actions"
                  aria-label="Project actions"
                >
                  <I.kebab />
                </button>
              </div>

              {menuFor === project.id && (
                <div
                  className="jq-context-menu"
                  onMouseDown={(e: MouseEvent) => {
                    e.stopPropagation();
                  }}
                >
                  <button
                    type="button"
                    className="jq-ctx-item"
                    onClick={() => {
                      setMenuFor(null);
                      onOpenProjectConfig(project.id);
                    }}
                  >
                    <I.cog />
                    <span>Configurer le projet…</span>
                    <span className="kbd">⌘,</span>
                  </button>
                  <button
                    type="button"
                    className="jq-ctx-item"
                    onClick={() => {
                      setMenuFor(null);
                      onNewSession(project.id);
                    }}
                  >
                    <I.plus />
                    <span>Nouvelle session</span>
                    <span className="kbd">⌘T</span>
                  </button>
                  <div className="jq-ctx-divider" />
                  <button type="button" className="jq-ctx-item" disabled>
                    <I.rename />
                    <span>Renommer…</span>
                  </button>
                  <button type="button" className="jq-ctx-item" disabled>
                    <I.duplicate />
                    <span>Dupliquer</span>
                  </button>
                  <div className="jq-ctx-divider" />
                  <button type="button" className="jq-ctx-item danger" disabled>
                    <I.trash />
                    <span>Supprimer le projet…</span>
                  </button>
                </div>
              )}

              {isOpen && (
                <div className="jq-sessions">
                  {sessions.map((session: SessionMeta) => {
                    const isActive: boolean =
                      project.id === activeProjectId && activeSessionId === session.id;
                    return (
                      <div
                        key={session.id}
                        className={cn(
                          "jq-session",
                          `status-${session.status}`,
                          isActive && "active",
                        )}
                        onClick={() => {
                          setActiveProject(project.id);
                          setActiveSession(project.id, session.id);
                        }}
                        title={
                          session.claudeId !== ""
                            ? `Claude session: ${session.claudeId}`
                            : session.name
                        }
                      >
                        <span className={cn("jq-session-status-dot", session.status)} />
                        <span className="jq-session-main">
                          <span className="jq-session-name">{session.name}</span>
                          {session.claudeId !== "" && (
                            <span className="jq-session-cid">
                              {shortenClaudeId(session.claudeId)}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          className="jq-session-edit"
                          onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            onEditSession(project.id, session.id);
                          }}
                          title="Modifier la session"
                          aria-label="Edit session"
                        >
                          <I.edit />
                        </button>
                        <button
                          type="button"
                          className={cn("jq-session-toggle", session.status)}
                          onClick={(e: MouseEvent) => {
                            e.stopPropagation();
                            void toggleSessionStatus(
                              session,
                              project.id,
                              killSession,
                              createSession,
                            );
                          }}
                          title={
                            session.status === "running"
                              ? "Stopper la session"
                              : "Démarrer une nouvelle session"
                          }
                          aria-label={
                            session.status === "running" ? "Stop session" : "Start session"
                          }
                        >
                          {session.status === "running" ? <I.stop /> : <I.play />}
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="jq-session-new"
                    onClick={(e: MouseEvent) => {
                      e.stopPropagation();
                      onNewSession(project.id);
                    }}
                  >
                    <I.plus />
                    <span>Nouvelle session</span>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

async function toggleSessionStatus(
  session: SessionMeta,
  projectId: string,
  killSession: (sessionId: string) => Promise<void>,
  createSession: (projectId: string, name?: string) => Promise<SessionMeta>,
): Promise<void> {
  try {
    if (session.status === "running") {
      await killSession(session.id);
      return;
    }
    // For stopped/idle sessions we spawn a fresh one. Real "resume via
    // claude --resume <id>" support lands in V0.2 (transcript backup).
    await createSession(projectId, session.name);
  } catch (err: unknown) {
    console.error("toggleSessionStatus failed", err);
  }
}

export type { SidebarProps };
