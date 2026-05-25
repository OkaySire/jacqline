import { create } from "zustand";

interface UiState {
  // Dialogs ------------------------------------------------------------------
  readonly newProjectDialogOpen: boolean;
  readonly settingsDialogOpen: boolean;
  readonly aboutDialogOpen: boolean;

  // App shell layout ---------------------------------------------------------
  readonly sidebarCollapsed: boolean;
  readonly inspectorHidden: boolean;

  // Actions ------------------------------------------------------------------
  readonly openNewProject: () => void;
  readonly closeNewProject: () => void;
  readonly openSettings: () => void;
  readonly closeSettings: () => void;
  readonly openAbout: () => void;
  readonly closeAbout: () => void;

  readonly toggleSidebar: () => void;
  readonly toggleInspector: () => void;
  readonly setSidebarCollapsed: (collapsed: boolean) => void;
  readonly setInspectorHidden: (hidden: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  newProjectDialogOpen: false,
  settingsDialogOpen: false,
  aboutDialogOpen: false,

  sidebarCollapsed: false,
  inspectorHidden: false,

  openNewProject: () => set({ newProjectDialogOpen: true }),
  closeNewProject: () => set({ newProjectDialogOpen: false }),
  openSettings: () => set({ settingsDialogOpen: true }),
  closeSettings: () => set({ settingsDialogOpen: false }),
  openAbout: () => set({ aboutDialogOpen: true }),
  closeAbout: () => set({ aboutDialogOpen: false }),

  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorHidden: !s.inspectorHidden })),
  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),
  setInspectorHidden: (hidden: boolean) => set({ inspectorHidden: hidden }),
}));
