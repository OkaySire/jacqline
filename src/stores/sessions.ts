import { create } from "zustand";

import { sessionCreate, sessionKill, sessionListByProject } from "@/lib/api/sessions";
import type { SessionMeta } from "@/types/session";

export interface SessionExitInfo {
  readonly sessionId: string;
  readonly code: number | null;
}

interface SessionsState {
  /** All known sessions for each project (running + idle + stopped). */
  readonly sessionsByProject: ReadonlyMap<string, readonly SessionMeta[]>;
  /** Which session is currently focused inside each project. */
  readonly activeSessionByProject: ReadonlyMap<string, string>;
  /** Latest non-clean exit per project — surfaced as a restart banner. */
  readonly lastExitByProject: ReadonlyMap<string, SessionExitInfo>;

  /** Fetch all sessions for a project from SQL and store them. Idempotent. */
  readonly loadProjectSessions: (projectId: string) => Promise<readonly SessionMeta[]>;

  /**
   * If the project has no live session, spawn one named `"main"` (or the next
   * default the backend gives us). Otherwise return the currently active
   * session (or the most recent running one). Coalesces concurrent calls per
   * project.
   */
  readonly ensureSession: (projectId: string) => Promise<SessionMeta>;

  /** Spawn a new session in the project, always. */
  readonly createSession: (projectId: string, name?: string) => Promise<SessionMeta>;

  /** Kill a specific session. The backend marks it `stopped` in SQL. */
  readonly killSession: (sessionId: string) => Promise<void>;

  /** Set which session is focused inside a project. */
  readonly setActiveSession: (projectId: string, sessionId: string) => void;

  /**
   * Dispatched by the Terminal component on `pty:exit:<sessionId>`. Marks the
   * session `stopped` locally (preserving it in the list) and records the
   * exit code for the restart banner.
   */
  readonly handleExit: (sessionId: string, code: number | null) => void;

  /** Clear the recorded exit info for `projectId` (e.g. after restart). */
  readonly clearExit: (projectId: string) => void;
}

const ensureInflight: Map<string, Promise<SessionMeta>> = new Map();
const loadInflight: Map<string, Promise<readonly SessionMeta[]>> = new Map();

function withSessionUpdated(
  map: ReadonlyMap<string, readonly SessionMeta[]>,
  meta: SessionMeta,
): Map<string, readonly SessionMeta[]> {
  const next: Map<string, readonly SessionMeta[]> = new Map(map);
  const current: readonly SessionMeta[] = next.get(meta.projectId) ?? [];
  const idx: number = current.findIndex((s: SessionMeta) => s.id === meta.id);
  if (idx >= 0) {
    const replaced: SessionMeta[] = current.slice();
    replaced[idx] = meta;
    next.set(meta.projectId, replaced);
  } else {
    next.set(meta.projectId, [...current, meta]);
  }
  return next;
}

function liveSessionFor(
  sessions: readonly SessionMeta[],
  activeId: string | undefined,
): SessionMeta | null {
  if (activeId !== undefined) {
    const found: SessionMeta | undefined = sessions.find((s) => s.id === activeId);
    if (found !== undefined && found.status === "running") {
      return found;
    }
  }
  // Fallback: most recently started session that's still running.
  const running: readonly SessionMeta[] = sessions.filter((s) => s.status === "running");
  if (running.length === 0) {
    return null;
  }
  return running[running.length - 1] ?? null;
}

export const useSessionsStore = create<SessionsState>()((set, get) => ({
  sessionsByProject: new Map<string, readonly SessionMeta[]>(),
  activeSessionByProject: new Map<string, string>(),
  lastExitByProject: new Map<string, SessionExitInfo>(),

  loadProjectSessions: (projectId: string): Promise<readonly SessionMeta[]> => {
    const pending = loadInflight.get(projectId);
    if (pending !== undefined) {
      return pending;
    }
    const promise: Promise<readonly SessionMeta[]> = sessionListByProject(projectId)
      .then((sessions: SessionMeta[]) => {
        set((state: SessionsState) => {
          const nextSessions: Map<string, readonly SessionMeta[]> = new Map(
            state.sessionsByProject,
          );
          nextSessions.set(projectId, sessions);
          return { sessionsByProject: nextSessions };
        });
        return sessions;
      })
      .finally(() => {
        loadInflight.delete(projectId);
      });
    loadInflight.set(projectId, promise);
    return promise;
  },

  ensureSession: (projectId: string): Promise<SessionMeta> => {
    const state: SessionsState = get();
    const existing: readonly SessionMeta[] = state.sessionsByProject.get(projectId) ?? [];
    const activeId: string | undefined = state.activeSessionByProject.get(projectId);
    const live: SessionMeta | null = liveSessionFor(existing, activeId);
    if (live !== null) {
      return Promise.resolve(live);
    }
    const pending = ensureInflight.get(projectId);
    if (pending !== undefined) {
      return pending;
    }
    const promise: Promise<SessionMeta> = sessionCreate(projectId)
      .then((meta: SessionMeta) => {
        set((s: SessionsState) => {
          const nextActive: Map<string, string> = new Map(s.activeSessionByProject);
          nextActive.set(projectId, meta.id);
          const nextExits: Map<string, SessionExitInfo> = new Map(s.lastExitByProject);
          nextExits.delete(projectId);
          return {
            sessionsByProject: withSessionUpdated(s.sessionsByProject, meta),
            activeSessionByProject: nextActive,
            lastExitByProject: nextExits,
          };
        });
        return meta;
      })
      .finally(() => {
        ensureInflight.delete(projectId);
      });
    ensureInflight.set(projectId, promise);
    return promise;
  },

  createSession: async (projectId: string, name?: string): Promise<SessionMeta> => {
    const meta: SessionMeta = await sessionCreate(projectId, name);
    set((s: SessionsState) => {
      const nextActive: Map<string, string> = new Map(s.activeSessionByProject);
      nextActive.set(projectId, meta.id);
      return {
        sessionsByProject: withSessionUpdated(s.sessionsByProject, meta),
        activeSessionByProject: nextActive,
      };
    });
    return meta;
  },

  killSession: async (sessionId: string): Promise<void> => {
    await sessionKill(sessionId);
    // The pty:exit event will fire shortly after; handleExit updates the
    // status. We don't optimistically remove here — the session stays in the
    // list as `stopped`.
  },

  setActiveSession: (projectId: string, sessionId: string): void => {
    set((s: SessionsState) => {
      const next: Map<string, string> = new Map(s.activeSessionByProject);
      next.set(projectId, sessionId);
      return { activeSessionByProject: next };
    });
  },

  handleExit: (sessionId: string, code: number | null): void => {
    set((state: SessionsState) => {
      let exitedProjectId: string | null = null;
      const nextSessions: Map<string, readonly SessionMeta[]> = new Map(state.sessionsByProject);
      for (const [projectId, sessions] of state.sessionsByProject) {
        const idx: number = sessions.findIndex((s: SessionMeta) => s.id === sessionId);
        if (idx >= 0) {
          exitedProjectId = projectId;
          const updated: SessionMeta[] = sessions.slice();
          const prev: SessionMeta = sessions[idx]!;
          updated[idx] = {
            ...prev,
            status: "stopped",
            endedAt: prev.endedAt ?? Date.now(),
          };
          nextSessions.set(projectId, updated);
          break;
        }
      }
      if (exitedProjectId === null) {
        return state;
      }
      const nextExits: Map<string, SessionExitInfo> = new Map(state.lastExitByProject);
      nextExits.set(exitedProjectId, { sessionId, code });
      return { sessionsByProject: nextSessions, lastExitByProject: nextExits };
    });
  },

  clearExit: (projectId: string): void => {
    set((state: SessionsState) => {
      if (!state.lastExitByProject.has(projectId)) {
        return state;
      }
      const next: Map<string, SessionExitInfo> = new Map(state.lastExitByProject);
      next.delete(projectId);
      return { lastExitByProject: next };
    });
  },
}));

/**
 * Convenience selector for components that just want "the session the user
 * is looking at right now in this project." Returns `null` if the project
 * has no live session.
 */
export function useActiveSession(projectId: string | null): SessionMeta | null {
  return useSessionsStore((state: SessionsState): SessionMeta | null => {
    if (projectId === null) {
      return null;
    }
    const sessions: readonly SessionMeta[] = state.sessionsByProject.get(projectId) ?? [];
    const activeId: string | undefined = state.activeSessionByProject.get(projectId);
    return liveSessionFor(sessions, activeId);
  });
}
