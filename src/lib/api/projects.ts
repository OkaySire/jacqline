import { invoke } from "@tauri-apps/api/core";
import type { NewProjectInput, Project, ProjectPatch } from "@/types/project";

/**
 * Raw shape returned by the Rust `Project` struct over the Tauri bridge.
 * Field names are snake_case on the wire; we adapt them once at the boundary.
 */
interface RawProject {
  readonly id: string;
  readonly name: string;
  readonly cwd: string;
  readonly shell_kind: Project["shellKind"];
  readonly shell_value: string;
  readonly provider: string;
  readonly created_at: number;
  readonly updated_at: number;
}

function fromRaw(raw: RawProject): Project {
  return {
    id: raw.id,
    name: raw.name,
    cwd: raw.cwd,
    shellKind: raw.shell_kind,
    shellValue: raw.shell_value,
    provider: raw.provider,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

interface RawProjectPatch {
  readonly name?: string;
  readonly cwd?: string;
  readonly shell_kind?: Project["shellKind"];
  readonly shell_value?: string;
  readonly provider?: string;
}

function patchToRaw(patch: ProjectPatch): RawProjectPatch {
  const raw: RawProjectPatch = {
    name: patch.name,
    cwd: patch.cwd,
    shell_kind: patch.shellKind,
    shell_value: patch.shellValue,
    provider: patch.provider,
  };
  return raw;
}

export async function projectList(): Promise<Project[]> {
  const rows: RawProject[] = await invoke<RawProject[]>("project_list");
  return rows.map(fromRaw);
}

export async function projectCreate(input: NewProjectInput): Promise<Project> {
  const raw: RawProject = await invoke<RawProject>("project_create", {
    name: input.name,
    cwd: input.cwd,
    shellKind: input.shellKind,
    shellValue: input.shellValue,
    provider: input.provider,
  });
  return fromRaw(raw);
}

export async function projectUpdate(id: string, patch: ProjectPatch): Promise<Project> {
  const raw: RawProject = await invoke<RawProject>("project_update", {
    id,
    patch: patchToRaw(patch),
  });
  return fromRaw(raw);
}

export async function projectDelete(id: string): Promise<void> {
  await invoke<void>("project_delete", { id });
}
