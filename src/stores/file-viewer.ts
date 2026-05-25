import { create } from "zustand";

export type ViewerMode = "preview" | "code" | "edit" | "diff";

export interface SelectedFile {
  readonly projectId: string;
  readonly relPath: string;
  readonly name: string;
}

interface FileViewerState {
  readonly selectedFile: SelectedFile | null;
  readonly mode: ViewerMode;

  readonly openFile: (file: SelectedFile) => void;
  readonly closeFile: () => void;
  readonly setMode: (mode: ViewerMode) => void;
}

export const useFileViewerStore = create<FileViewerState>()((set) => ({
  selectedFile: null,
  mode: "preview",

  openFile: (file: SelectedFile) => set({ selectedFile: file, mode: "preview" }),
  closeFile: () => set({ selectedFile: null, mode: "preview" }),
  setMode: (mode: ViewerMode) => set({ mode }),
}));
