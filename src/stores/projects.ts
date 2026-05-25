import { create } from "zustand";

import { projectCreate, projectDelete, projectList, projectUpdate } from "@/lib/api/projects";
import type { NewProjectInput, Project, ProjectPatch } from "@/types/project";

interface ProjectsState {
  readonly projects: readonly Project[];
  readonly activeProjectId: string | null;
  readonly loading: boolean;
  readonly error: string | null;

  readonly hydrate: () => Promise<void>;
  readonly create: (input: NewProjectInput) => Promise<Project>;
  readonly update: (id: string, patch: ProjectPatch) => Promise<Project>;
  readonly remove: (id: string) => Promise<void>;
  readonly setActive: (id: string | null) => void;
  readonly clearError: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return "unknown error";
  }
}

export const useProjectsStore = create<ProjectsState>()((set) => ({
  projects: [],
  activeProjectId: null,
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true, error: null });
    try {
      const projects: Project[] = await projectList();
      set({ projects, loading: false });
    } catch (err: unknown) {
      set({ error: errorMessage(err), loading: false });
    }
  },

  create: async (input: NewProjectInput) => {
    const project: Project = await projectCreate(input);
    set((state: ProjectsState) => ({
      projects: [project, ...state.projects],
      activeProjectId: project.id,
    }));
    return project;
  },

  update: async (id: string, patch: ProjectPatch) => {
    const updated: Project = await projectUpdate(id, patch);
    set((state: ProjectsState) => ({
      projects: state.projects.map((p: Project) => (p.id === id ? updated : p)),
    }));
    return updated;
  },

  remove: async (id: string) => {
    await projectDelete(id);
    set((state: ProjectsState) => ({
      projects: state.projects.filter((p: Project) => p.id !== id),
      activeProjectId: state.activeProjectId === id ? null : state.activeProjectId,
    }));
  },

  setActive: (id: string | null) => set({ activeProjectId: id }),

  clearError: () => set({ error: null }),
}));

/**
 * Convenience selector: returns the currently active project, or `null` if none.
 * Uses a derived selector so consumers re-render only when the underlying project changes.
 */
export function useActiveProject(): Project | null {
  return useProjectsStore((state: ProjectsState): Project | null => {
    if (state.activeProjectId === null) {
      return null;
    }
    return state.projects.find((p: Project) => p.id === state.activeProjectId) ?? null;
  });
}
