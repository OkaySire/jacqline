import { invoke } from "@tauri-apps/api/core";

import type { DirEntry } from "@/types/fs";

interface RawDirEntry {
  readonly name: string;
  readonly kind: DirEntry["kind"];
  readonly size: number;
  readonly modified: number | null;
}

function fromRaw(raw: RawDirEntry): DirEntry {
  return {
    name: raw.name,
    kind: raw.kind,
    size: raw.size,
    modified: raw.modified,
  };
}

export async function fsList(projectId: string, relPath: string): Promise<DirEntry[]> {
  const rows: RawDirEntry[] = await invoke<RawDirEntry[]>("fs_list", {
    projectId,
    relPath,
  });
  return rows.map(fromRaw);
}

export async function fsRead(projectId: string, relPath: string): Promise<Uint8Array> {
  const bytes: number[] = await invoke<number[]>("fs_read", { projectId, relPath });
  return new Uint8Array(bytes);
}

export async function fsWrite(projectId: string, relPath: string, data: Uint8Array): Promise<void> {
  await invoke<void>("fs_write", { projectId, relPath, data: Array.from(data) });
}
