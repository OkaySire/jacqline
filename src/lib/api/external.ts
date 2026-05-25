import { invoke } from "@tauri-apps/api/core";

export async function gitDiff(projectId: string, relPath: string): Promise<string> {
  const diff: string = await invoke<string>("git_diff", { projectId, relPath });
  return diff;
}

export async function shellOpenExternal(projectId: string, relPath: string): Promise<void> {
  await invoke<void>("shell_open_external", { projectId, relPath });
}
