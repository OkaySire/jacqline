import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { rust } from "@codemirror/lang-rust";
import { type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { useEffect, useRef, useState } from "react";

import { fsWrite } from "@/lib/api/fs";
import { useSettingsStore } from "@/stores/settings";

interface CodeViewProps {
  readonly text: string;
  readonly filename: string;
  readonly editable: boolean;
  readonly projectId: string;
  readonly relPath: string;
  readonly onSaved: (nextText: string) => void;
}

function languageFor(filename: string): Extension[] {
  const lower: string = filename.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".mdx") || lower.endsWith(".markdown")) {
    return [markdown()];
  }
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) {
    return [json()];
  }
  if (lower.endsWith(".rs")) {
    return [rust()];
  }
  if (
    lower.endsWith(".ts") ||
    lower.endsWith(".tsx") ||
    lower.endsWith(".js") ||
    lower.endsWith(".jsx") ||
    lower.endsWith(".mjs") ||
    lower.endsWith(".cjs")
  ) {
    return [
      javascript({
        typescript: lower.endsWith(".ts") || lower.endsWith(".tsx"),
        jsx: lower.endsWith(".tsx") || lower.endsWith(".jsx"),
      }),
    ];
  }
  return [];
}

function jacqlineTheme(fontFamily: string, fontSize: number): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "transparent",
        color: "#f2f2f2",
        height: "100%",
        fontSize: `${String(fontSize)}px`,
      },
      ".cm-content": {
        fontFamily,
        caretColor: "#7c3aed",
      },
      ".cm-scroller": { fontFamily: "inherit" },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "#5a5754",
        border: "none",
      },
      ".cm-activeLineGutter": { backgroundColor: "rgba(124, 58, 237, 0.08)" },
      ".cm-activeLine": { backgroundColor: "rgba(124, 58, 237, 0.05)" },
      ".cm-cursor": { borderLeftColor: "#7c3aed" },
      "&.cm-focused": { outline: "none" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "rgba(124, 58, 237, 0.25)",
      },
    },
    { dark: true },
  );
}

export function CodeView({ text, filename, editable, projectId, relPath, onSaved }: CodeViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // Font settings captured on mount — see the Terminal component for the same
  // rationale.
  const fontFamily: string = useSettingsStore.getState().fontFamily;
  const fontSize: number = useSettingsStore.getState().fontSize;

  // Mount xterm-style: build the editor on mount, dispose on unmount. Switching
  // editable / language / file is handled by the `key` on the parent.
  useEffect(() => {
    const host: HTMLDivElement | null = hostRef.current;
    if (host === null) {
      return;
    }

    const saveKeymap = keymap.of([
      {
        key: "Mod-s",
        run: (view: EditorView): boolean => {
          if (!editable) {
            return false;
          }
          const current: string = view.state.doc.toString();
          setSaveStatus("saving");
          setSaveError(null);
          fsWrite(projectId, relPath, new TextEncoder().encode(current))
            .then(() => {
              setSaveStatus("saved");
              onSaved(current);
              window.setTimeout(() => {
                setSaveStatus("idle");
              }, 1500);
            })
            .catch((err: unknown) => {
              setSaveStatus("error");
              setSaveError(err instanceof Error ? err.message : String(err));
            });
          return true;
        },
      },
    ]);

    const extensions: Extension[] = [
      lineNumbers(),
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      saveKeymap,
      jacqlineTheme(fontFamily, fontSize),
      EditorView.editable.of(editable),
      EditorView.lineWrapping,
      ...languageFor(filename),
    ];

    const view = new EditorView({
      doc: text,
      parent: host,
      extensions,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [text, filename, editable, projectId, relPath, onSaved, fontFamily, fontSize]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={hostRef} className="min-h-0 flex-1 overflow-auto" />
      {editable && (
        <div className="border-border/60 text-muted-foreground flex h-6 items-center justify-between border-t px-3 text-[10px]">
          <span>Cmd/Ctrl+S to save</span>
          <span
            className={
              saveStatus === "error"
                ? "text-destructive"
                : saveStatus === "saved"
                  ? "text-emerald-400"
                  : ""
            }
          >
            {saveStatus === "saving" && "Saving…"}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && (saveError ?? "Save failed")}
          </span>
        </div>
      )}
    </div>
  );
}
