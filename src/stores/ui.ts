import { create } from "zustand";

export interface SessionDialogState {
  readonly mode: "new" | "edit";
  readonly projectId: string;
  readonly sessionId: string | null;
}

interface UiState {
  // Dialogs ------------------------------------------------------------------
  readonly newProjectDialogOpen: boolean;
  readonly customizeOpen: boolean;
  /** Project id whose ProjectConfigWindow is open, or null. */
  readonly projectConfigFor: string | null;
  readonly sessionDialog: SessionDialogState | null;

  // App shell layout ---------------------------------------------------------
  readonly sidebarCollapsed: boolean;
  readonly inspectorHidden: boolean;

  // Actions ------------------------------------------------------------------
  readonly openNewProject: () => void;
  readonly closeNewProject: () => void;
  readonly openCustomize: () => void;
  readonly closeCustomize: () => void;
  readonly openProjectConfig: (projectId: string) => void;
  readonly closeProjectConfig: () => void;
  readonly openNewSession: (projectId: string) => void;
  readonly openEditSession: (projectId: string, sessionId: string) => void;
  readonly closeSessionDialog: () => void;

  readonly toggleSidebar: () => void;
  readonly toggleInspector: () => void;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setInspectorHidden: (hidden: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  newProjectDialogOpen: false,
  customizeOpen: false,
  projectConfigFor: null,
  sessionDialog: null,

  sidebarCollapsed: false,
  inspectorHidden: false,

  openNewProject: () => set({ newProjectDialogOpen: true }),
  closeNewProject: () => set({ newProjectDialogOpen: false }),
  openCustomize: () => set({ customizeOpen: true }),
  closeCustomize: () => set({ customizeOpen: false }),
  openProjectConfig: (projectId: string) => set({ projectConfigFor: projectId }),
  closeProjectConfig: () => set({ projectConfigFor: null }),
  openNewSession: (projectId: string) =>
    set({ sessionDialog: { mode: "new", projectId, sessionId: null } }),
  openEditSession: (projectId: string, sessionId: string) =>
    set({ sessionDialog: { mode: "edit", projectId, sessionId } }),
  closeSessionDialog: () => set({ sessionDialog: null }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorHidden: !s.inspectorHidden })),
  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),
  setInspectorHidden: (hidden: boolean) => set({ inspectorHidden: hidden }),
}));
