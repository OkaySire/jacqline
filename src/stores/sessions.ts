import { create } from "zustand";

import { sessionCreate, sessionKill } from "@/lib/api/sessions";
import type { SessionMeta } from "@/types/session";

export interface SessionExitInfo {
  readonly sessionId: string;
  readonly code: number | null;
}

interface SessionsState {
  readonly sessionsByProject: ReadonlyMap<string, SessionMeta>;
  readonly lastExitByProject: ReadonlyMap<string, SessionExitInfo>;

  /**
   * Returns the live session for the project, spawning one on the fly if
   * needed. Concurrent calls for the same project return the same session.
   */
  readonly ensureSession: (projectId: string) => Promise<SessionMeta>;

  /** Kill the live session for `projectId`, if any. */
  readonly killSession: (projectId: string) => Promise<void>;

  /**
   * Called by the Terminal component when the backend emits
   * `pty:exit:<sessionId>`. Removes the session from the project map and
   * records the exit code so the UI can offer to restart.
   */
  readonly handleExit: (sessionId: string, code: number | null) => void;

  /** Clear the recorded exit info for `projectId` (e.g. after restart). */
  readonly clearExit: (projectId: string) => void;
}

const inflight: Map<string, Promise<SessionMeta>> = new Map();

export const useSessionsStore = create<SessionsState>()((set, get) => ({
  sessionsByProject: new Map<string, SessionMeta>(),
  lastExitByProject: new Map<string, SessionExitInfo>(),

  ensureSession: async (projectId: string): Promise<SessionMeta> => {
    const existing: SessionMeta | undefined = get().sessionsByProject.get(projectId);
    if (existing !== undefined) {
      return existing;
    }
    // Coalesce concurrent calls for the same project so we don't spawn two
    // PTYs (e.g. if the user clicks the project twice in quick succession).
    const pending: Promise<SessionMeta> | undefined = inflight.get(projectId);
    if (pending !== undefined) {
      return pending;
    }

    const promise: Promise<SessionMeta> = sessionCreate(projectId)
      .then((meta: SessionMeta) => {
        set((state: SessionsState) => {
          const nextSessions: Map<string, SessionMeta> = new Map(state.sessionsByProject);
          nextSessions.set(projectId, meta);
          const nextExits: Map<string, SessionExitInfo> = new Map(state.lastExitByProject);
          nextExits.delete(projectId);
          return { sessionsByProject: nextSessions, lastExitByProject: nextExits };
        });
        return meta;
      })
      .finally(() => {
        inflight.delete(projectId);
      });

    inflight.set(projectId, promise);
    return promise;
  },

  killSession: async (projectId: string): Promise<void> => {
    const meta: SessionMeta | undefined = get().sessionsByProject.get(projectId);
    if (meta === undefined) {
      return;
    }
    // Optimistically drop the mapping so the UI stops rendering the terminal
    // immediately; the pty:exit event will fire shortly after.
    set((state: SessionsState) => {
      const next: Map<string, SessionMeta> = new Map(state.sessionsByProject);
      next.delete(projectId);
      return { sessionsByProject: next };
    });
    await sessionKill(meta.id);
  },

  handleExit: (sessionId: string, code: number | null): void => {
    set((state: SessionsState) => {
      let exitedProjectId: string | null = null;
      const nextSessions: Map<string, SessionMeta> = new Map(state.sessionsByProject);
      for (const [projectId, meta] of state.sessionsByProject) {
        if (meta.id === sessionId) {
          exitedProjectId = projectId;
          nextSessions.delete(projectId);
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
