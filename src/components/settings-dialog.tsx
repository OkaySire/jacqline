import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_EXTERNAL_EDITOR,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE,
  useSettingsStore,
} from "@/stores/settings";
import { useUiStore } from "@/stores/ui";

export function SettingsDialog() {
  const open: boolean = useUiStore((s) => s.settingsDialogOpen);
  const close: () => void = useUiStore((s) => s.closeSettings);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        {/* Mount the form only when the dialog is open so it always reads the
            latest settings into its local state (no `useEffect` reset). */}
        {open && <SettingsForm onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function SettingsForm({ onClose }: { readonly onClose: () => void }) {
  const initialFontFamily: string = useSettingsStore((s) => s.fontFamily);
  const initialFontSize: number = useSettingsStore((s) => s.fontSize);
  const initialExternalEditor: string = useSettingsStore((s) => s.externalEditor);
  const update = useSettingsStore((s) => s.update);

  const [fontFamily, setFontFamily] = useState<string>(initialFontFamily);
  const [fontSize, setFontSize] = useState<string>(String(initialFontSize));
  const [externalEditor, setExternalEditor] = useState<string>(initialExternalEditor);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const parsedSize: number = Number.parseInt(fontSize, 10);
    if (!Number.isFinite(parsedSize) || parsedSize < 8 || parsedSize > 32) {
      setError("Font size must be a number between 8 and 32.");
      return;
    }
    if (fontFamily.trim() === "") {
      setError("Font family cannot be empty.");
      return;
    }
    if (externalEditor.trim() === "") {
      setError("External editor command cannot be empty.");
      return;
    }

    setSubmitting(true);
    try {
      await update({
        fontFamily: fontFamily.trim(),
        fontSize: parsedSize,
        externalEditor: externalEditor.trim(),
      });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset(): void {
    setFontFamily(DEFAULT_FONT_FAMILY);
    setFontSize(String(DEFAULT_FONT_SIZE));
    setExternalEditor(DEFAULT_EXTERNAL_EDITOR);
  }

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        void handleSubmit(event);
      }}
    >
      <DialogHeader>
        <DialogTitle className="tracking-tight">Settings</DialogTitle>
        <DialogDescription>
          Font and external editor settings persist locally. Font changes apply on the next terminal
          or editor mount.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="settings-font-family">Font family (monospace)</Label>
          <Input
            id="settings-font-family"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            placeholder={DEFAULT_FONT_FAMILY}
            className="font-mono text-xs"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-font-size">Font size (px)</Label>
          <Input
            id="settings-font-size"
            type="number"
            min={8}
            max={32}
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="settings-external-editor">External editor command</Label>
          <Input
            id="settings-external-editor"
            value={externalEditor}
            onChange={(e) => setExternalEditor(e.target.value)}
            placeholder="code {path}"
            className="font-mono text-xs"
          />
          <p className="text-muted-foreground text-xs">
            <code className="font-mono">{"{path}"}</code> is replaced with the absolute file path.
            Examples: <code className="font-mono">cursor {"{path}"}</code>,{" "}
            <code className="font-mono">zed {"{path}"}</code>,{" "}
            <code className="font-mono">vim {"{path}"}</code>.
          </p>
        </div>
        {error !== null && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={handleReset}>
          Reset
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </DialogFooter>
    </form>
  );
}
