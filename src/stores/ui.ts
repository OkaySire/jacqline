import { create } from "zustand";

interface UiState {
  readonly newProjectDialogOpen: boolean;
  readonly settingsDialogOpen: boolean;
  readonly aboutDialogOpen: boolean;

  readonly openNewProject: () => void;
  readonly closeNewProject: () => void;
  readonly openSettings: () => void;
  readonly closeSettings: () => void;
  readonly openAbout: () => void;
  readonly closeAbout: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  newProjectDialogOpen: false,
  settingsDialogOpen: false,
  aboutDialogOpen: false,

  openNewProject: () => set({ newProjectDialogOpen: true }),
  closeNewProject: () => set({ newProjectDialogOpen: false }),
  openSettings: () => set({ settingsDialogOpen: true }),
  closeSettings: () => set({ settingsDialogOpen: false }),
  openAbout: () => set({ aboutDialogOpen: true }),
  closeAbout: () => set({ aboutDialogOpen: false }),
}));
