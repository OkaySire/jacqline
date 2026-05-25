export type ShellKind = "native" | "wsl";

/**
 * A `ShellTarget` describes what kind of shell a project should spawn its session inside.
 * Mirrors the Rust `ShellKind` enum + `shell_value` column.
 *
 * - `native` → `shell_value` is one of `bash`, `zsh`, `fish`, `pwsh`, `cmd`, …
 * - `wsl`    → `shell_value` is the distro name (e.g. `Ubuntu`, `Debian`)
 */
export type ShellTarget =
  | { readonly kind: "native"; readonly shell: string }
  | { readonly kind: "wsl"; readonly distro: string };

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  readonly shellKind: ShellKind;
  readonly shellValue: string;
  readonly provider: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Subset of fields the user may mutate on a project. */
export interface ProjectPatch {
  readonly name?: string;
  readonly cwd?: string;
  readonly shellKind?: ShellKind;
  readonly shellValue?: string;
  readonly provider?: string;
}

/** Required fields to create a new project. */
export interface NewProjectInput {
  readonly name: string;
  readonly cwd: string;
  readonly shellKind: ShellKind;
  readonly shellValue: string;
  readonly provider?: string;
}

export function shellTargetOf(project: Project): ShellTarget {
  if (project.shellKind === "wsl") {
    return { kind: "wsl", distro: project.shellValue };
  }
  return { kind: "native", shell: project.shellValue };
}
