import { invoke } from "@tauri-apps/api/core";

import type { SessionMeta, SessionStatus } from "@/types/session";

interface RawSessionMeta {
  readonly id: string;
  readonly project_id: string;
  readonly name: string;
  readonly claude_id: string;
  readonly status: SessionStatus;
  readonly pid: number;
  readonly started_at: number;
  readonly ended_at: number | null;
}

function fromRaw(raw: RawSessionMeta): SessionMeta {
  return {
    id: raw.id,
    projectId: raw.project_id,
    name: raw.name,
    claudeId: raw.claude_id,
    status: raw.status,
    pid: raw.pid,
    startedAt: raw.started_at,
    endedAt: raw.ended_at,
  };
}

export async function sessionCreate(
  projectId: string,
  name?: string,
  withClaude?: boolean,
): Promise<SessionMeta> {
  const raw: RawSessionMeta = await invoke<RawSessionMeta>("session_create", {
    projectId,
    name: name ?? null,
    withClaude: withClaude ?? null,
  });
  return fromRaw(raw);
}

/** In-memory list — only currently-running sessions. */
export async function sessionList(): Promise<SessionMeta[]> {
  const raws: RawSessionMeta[] = await invoke<RawSessionMeta[]>("session_list");
  return raws.map(fromRaw);
}

/** SQL list — running + idle + stopped sessions for a single project. */
export async function sessionListByProject(projectId: string): Promise<SessionMeta[]> {
  const raws: RawSessionMeta[] = await invoke<RawSessionMeta[]>("session_list_by_project", {
    projectId,
  });
  return raws.map(fromRaw);
}

export async function sessionKill(sessionId: string): Promise<void> {
  await invoke<void>("session_kill", { sessionId });
}

export async function sessionRestart(
  sessionId: string,
  withClaude?: boolean,
): Promise<SessionMeta> {
  const raw: RawSessionMeta = await invoke<RawSessionMeta>("session_restart", {
    sessionId,
    withClaude: withClaude ?? null,
  });
  return fromRaw(raw);
}

export async function sessionDelete(sessionId: string): Promise<void> {
  await invoke<void>("session_delete", { sessionId });
}

export async function sessionUpdateMeta(sessionId: string, name: string): Promise<SessionMeta> {
  const raw: RawSessionMeta = await invoke<RawSessionMeta>("session_update_meta", {
    sessionId,
    name,
  });
  return fromRaw(raw);
}

export async function ptyWrite(sessionId: string, data: Uint8Array): Promise<void> {
  // Tauri's serializer accepts numeric arrays for `Vec<u8>` — convert the
  // typed array into a plain `number[]` at the boundary.
  await invoke<void>("pty_write", { sessionId, data: Array.from(data) });
}

export async function ptyResize(sessionId: string, cols: number, rows: number): Promise<void> {
  await invoke<void>("pty_resize", { sessionId, cols, rows });
}
