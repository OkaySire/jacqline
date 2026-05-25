import { invoke } from "@tauri-apps/api/core";

import type { SessionMeta } from "@/types/session";

interface RawSessionMeta {
  readonly id: string;
  readonly project_id: string;
  readonly pid: number;
  readonly started_at: number;
}

function fromRaw(raw: RawSessionMeta): SessionMeta {
  return {
    id: raw.id,
    projectId: raw.project_id,
    pid: raw.pid,
    startedAt: raw.started_at,
  };
}

export async function sessionCreate(projectId: string): Promise<SessionMeta> {
  const raw: RawSessionMeta = await invoke<RawSessionMeta>("session_create", { projectId });
  return fromRaw(raw);
}

export async function sessionList(): Promise<SessionMeta[]> {
  const raws: RawSessionMeta[] = await invoke<RawSessionMeta[]>("session_list");
  return raws.map(fromRaw);
}

export async function sessionKill(sessionId: string): Promise<void> {
  await invoke<void>("session_kill", { sessionId });
}

export async function ptyWrite(sessionId: string, data: Uint8Array): Promise<void> {
  // Tauri's serializer accepts numeric arrays for `Vec<u8>` — convert the
  // typed array into a plain `number[]` at the boundary.
  await invoke<void>("pty_write", { sessionId, data: Array.from(data) });
}

export async function ptyResize(sessionId: string, cols: number, rows: number): Promise<void> {
  await invoke<void>("pty_resize", { sessionId, cols, rows });
}
