import { invoke } from "@tauri-apps/api/core";

import type { ShellKind } from "@/types/project";

interface RawShellOption {
  readonly label: string;
  readonly shell_kind: ShellKind;
  readonly shell_value: string;
}

export interface ShellOption {
  readonly label: string;
  readonly shellKind: ShellKind;
  readonly shellValue: string;
}

export async function detectShells(): Promise<ShellOption[]> {
  const rows: RawShellOption[] = await invoke<RawShellOption[]>("detect_shells");
  return rows.map((r: RawShellOption) => ({
    label: r.label,
    shellKind: r.shell_kind,
    shellValue: r.shell_value,
  }));
}
