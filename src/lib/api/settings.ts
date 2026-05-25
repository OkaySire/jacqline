import { invoke } from "@tauri-apps/api/core";

export async function settingGet(key: string): Promise<string | null> {
  const value: string | null = await invoke<string | null>("setting_get", { key });
  return value;
}

export async function settingSet(key: string, value: string): Promise<void> {
  await invoke<void>("setting_set", { key, value });
}
