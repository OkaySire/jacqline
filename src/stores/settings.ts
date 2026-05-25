import { create } from "zustand";

import { settingGet, settingSet } from "@/lib/api/settings";

export const DEFAULT_FONT_FAMILY: string =
  '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';
export const DEFAULT_FONT_SIZE: number = 13;
export const DEFAULT_EXTERNAL_EDITOR: string = "code {path}";

interface SettingsState {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly externalEditor: string;
  readonly hydrated: boolean;

  readonly hydrate: () => Promise<void>;
  readonly update: (patch: Partial<SettingsPatch>) => Promise<void>;
}

interface SettingsPatch {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly externalEditor: string;
}

const KEY_FONT_FAMILY: string = "ui.font_family";
const KEY_FONT_SIZE: string = "ui.font_size";
const KEY_EXTERNAL_EDITOR: string = "external_editor";

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  externalEditor: DEFAULT_EXTERNAL_EDITOR,
  hydrated: false,

  hydrate: async (): Promise<void> => {
    try {
      const [fontFamily, fontSizeRaw, externalEditor] = await Promise.all([
        settingGet(KEY_FONT_FAMILY),
        settingGet(KEY_FONT_SIZE),
        settingGet(KEY_EXTERNAL_EDITOR),
      ]);
      const parsedSize: number | null =
        fontSizeRaw !== null ? Number.parseInt(fontSizeRaw, 10) : null;
      set({
        fontFamily: fontFamily ?? DEFAULT_FONT_FAMILY,
        fontSize:
          parsedSize !== null && Number.isFinite(parsedSize) && parsedSize > 0
            ? parsedSize
            : DEFAULT_FONT_SIZE,
        externalEditor: externalEditor ?? DEFAULT_EXTERNAL_EDITOR,
        hydrated: true,
      });
    } catch (err: unknown) {
      console.error("settings hydrate failed", err);
      set({ hydrated: true });
    }
  },

  update: async (patch: Partial<SettingsPatch>): Promise<void> => {
    const current: SettingsState = get();
    const next: SettingsPatch = {
      fontFamily: patch.fontFamily ?? current.fontFamily,
      fontSize: patch.fontSize ?? current.fontSize,
      externalEditor: patch.externalEditor ?? current.externalEditor,
    };
    await Promise.all([
      patch.fontFamily !== undefined ? settingSet(KEY_FONT_FAMILY, next.fontFamily) : null,
      patch.fontSize !== undefined ? settingSet(KEY_FONT_SIZE, String(next.fontSize)) : null,
      patch.externalEditor !== undefined
        ? settingSet(KEY_EXTERNAL_EDITOR, next.externalEditor)
        : null,
    ]);
    set({
      fontFamily: next.fontFamily,
      fontSize: next.fontSize,
      externalEditor: next.externalEditor,
    });
  },
}));
