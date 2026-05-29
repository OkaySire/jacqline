import { create } from "zustand";

import { settingGet, settingSet } from "@/lib/api/settings";

export const DEFAULT_FONT_FAMILY: string =
  '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace';
export const DEFAULT_FONT_SIZE: number = 13;
export const DEFAULT_EXTERNAL_EDITOR: string = "code {path}";
export const DEFAULT_INSPECTOR_WIDTH: number = 320;
export const MIN_INSPECTOR_WIDTH: number = 280;
export const MAX_INSPECTOR_WIDTH: number = 800;

interface SettingsState {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly externalEditor: string;
  readonly inspectorWidth: number;
  readonly hydrated: boolean;

  readonly hydrate: () => Promise<void>;
  readonly update: (patch: Partial<SettingsPatch>) => Promise<void>;
}

interface SettingsPatch {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly externalEditor: string;
  readonly inspectorWidth: number;
}

const KEY_FONT_FAMILY: string = "ui.font_family";
const KEY_FONT_SIZE: string = "ui.font_size";
const KEY_EXTERNAL_EDITOR: string = "external_editor";
const KEY_INSPECTOR_WIDTH: string = "ui.inspector_width";

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: DEFAULT_FONT_SIZE,
  externalEditor: DEFAULT_EXTERNAL_EDITOR,
  inspectorWidth: DEFAULT_INSPECTOR_WIDTH,
  hydrated: false,

  hydrate: async (): Promise<void> => {
    try {
      const [fontFamily, fontSizeRaw, externalEditor, inspectorWidthRaw] = await Promise.all([
        settingGet(KEY_FONT_FAMILY),
        settingGet(KEY_FONT_SIZE),
        settingGet(KEY_EXTERNAL_EDITOR),
        settingGet(KEY_INSPECTOR_WIDTH),
      ]);
      const parsedSize: number | null =
        fontSizeRaw !== null ? Number.parseInt(fontSizeRaw, 10) : null;
      const parsedInspectorWidth: number | null =
        inspectorWidthRaw !== null ? Number.parseInt(inspectorWidthRaw, 10) : null;
      set({
        fontFamily: fontFamily ?? DEFAULT_FONT_FAMILY,
        fontSize:
          parsedSize !== null && Number.isFinite(parsedSize) && parsedSize > 0
            ? parsedSize
            : DEFAULT_FONT_SIZE,
        externalEditor: externalEditor ?? DEFAULT_EXTERNAL_EDITOR,
        inspectorWidth:
          parsedInspectorWidth !== null && Number.isFinite(parsedInspectorWidth)
            ? clampInspectorWidth(parsedInspectorWidth)
            : DEFAULT_INSPECTOR_WIDTH,
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
      inspectorWidth:
        patch.inspectorWidth !== undefined
          ? clampInspectorWidth(patch.inspectorWidth)
          : current.inspectorWidth,
    };
    await Promise.all([
      patch.fontFamily !== undefined ? settingSet(KEY_FONT_FAMILY, next.fontFamily) : null,
      patch.fontSize !== undefined ? settingSet(KEY_FONT_SIZE, String(next.fontSize)) : null,
      patch.externalEditor !== undefined
        ? settingSet(KEY_EXTERNAL_EDITOR, next.externalEditor)
        : null,
      patch.inspectorWidth !== undefined
        ? settingSet(KEY_INSPECTOR_WIDTH, String(next.inspectorWidth))
        : null,
    ]);
    set({
      fontFamily: next.fontFamily,
      fontSize: next.fontSize,
      externalEditor: next.externalEditor,
      inspectorWidth: next.inspectorWidth,
    });
  },
}));

export function clampInspectorWidth(value: number): number {
  return Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, Math.round(value)));
}
