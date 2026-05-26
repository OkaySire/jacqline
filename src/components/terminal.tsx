import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTermTerminal, type ITheme } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import "@xterm/xterm/css/xterm.css";

import { ptyResize, ptyWrite } from "@/lib/api/sessions";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";
import { useSettingsStore } from "@/stores/settings";

// Background = `--color-bg-terminal` from the V2 token set
// (oklch(0.135 0.004 60) ≈ #1d1c1a). The wrapper around `.jq-xterm-wrap` uses
// the same token so there's no visible seam.
const JACQLINE_THEME: ITheme = {
  background: "#1d1c1a",
  foreground: "#e8e7e5",
  cursor: "#a78bfa",
  cursorAccent: "#1d1c1a",
  selectionBackground: "#3a3735",
  selectionForeground: "#e8e7e5",
  black: "#1a1816",
  red: "#e07a7a",
  green: "#7cc78a",
  yellow: "#dab464",
  blue: "#7d9ee5",
  magenta: "#b794f6",
  cyan: "#6cc6c2",
  white: "#d4d2cf",
  brightBlack: "#5a5754",
  brightRed: "#ff8e8e",
  brightGreen: "#9ada9c",
  brightYellow: "#f0cb7a",
  brightBlue: "#9bb7f0",
  brightMagenta: "#cba8ff",
  brightCyan: "#86dfd9",
  brightWhite: "#ffffff",
};

interface TerminalProps {
  readonly sessionId: string;
  readonly hidden?: boolean;
}

/**
 * xterm.js + portable-pty bridge. Subscribes to `pty:data:<sessionId>` events
 * for output, sends user input back via `pty_write`, and pushes terminal
 * resizes to the backend via `pty_resize` + a `ResizeObserver` on the host
 * element.
 *
 * Layout: an outer wrapper carries the visual padding so the terminal "floats"
 * inside the MainPane card; xterm itself mounts on the inner element which has
 * no padding (FitAddon needs a clean `getBoundingClientRect()`).
 *
 * The component **does not** kill the session on unmount — that's the
 * responsibility of the sessions store. Setting `hidden` toggles CSS
 * visibility while keeping the xterm instance (and its scrollback) alive so
 * switching between projects doesn't reset history.
 */
export function Terminal({ sessionId, hidden = false }: TerminalProps) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const handleExit = useSessionsStore((s) => s.handleExit);
  // Font settings are captured on mount only; users will see changes on the
  // next session start. Re-creating xterm to apply a font live would reset
  // scrollback, which is more disruptive than waiting for the next spawn.
  const fontFamily: string = useSettingsStore.getState().fontFamily;
  const fontSize: number = useSettingsStore.getState().fontSize;

  useEffect(() => {
    const host: HTMLDivElement | null = innerRef.current;
    if (host === null) {
      return;
    }

    const term = new XTermTerminal({
      theme: JACQLINE_THEME,
      fontFamily,
      fontSize,
      lineHeight: 1.25,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      allowTransparency: false,
      convertEol: false,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.loadAddon(new WebLinksAddon());

    term.open(host);
    // Initial fit — safe even if host is `display: none`, in which case xterm
    // keeps the default 80x24 until ResizeObserver fires with a real size.
    try {
      fitAddon.fit();
      if (term.cols > 0 && term.rows > 0) {
        void ptyResize(sessionId, term.cols, term.rows);
      }
    } catch {
      // Ignore — ResizeObserver will retry once the element has a real size.
    }

    const encoder = new TextEncoder();
    const dataDisposable = term.onData((data: string): void => {
      void ptyWrite(sessionId, encoder.encode(data));
    });
    const resizeDisposable = term.onResize(({ cols, rows }: { cols: number; rows: number }) => {
      void ptyResize(sessionId, cols, rows);
    });

    let unlistenData: UnlistenFn | null = null;
    let unlistenExit: UnlistenFn | null = null;
    let disposed: boolean = false;

    const sessionTag: string = sessionId.slice(0, 8);
    console.log(`[pty ${sessionTag}] terminal mount, registering listeners`);
    void (async () => {
      const dataUnsubPromise: Promise<UnlistenFn> = listen<number[]>(
        `pty:data:${sessionId}`,
        (event) => {
          // Bytes count + 40-char ASCII preview help triage in DevTools when
          // the terminal stays visually empty even though Rust says it
          // emitted chunks.
          const len: number = event.payload.length;
          const preview: string = event.payload
            .slice(0, 40)
            .map((b: number): string => (b >= 32 && b < 127 ? String.fromCharCode(b) : "."))
            .join("");
          console.log(`[pty ${sessionTag}] data ${String(len)}B`, preview);
          term.write(new Uint8Array(event.payload));
        },
      );
      const exitUnsubPromise: Promise<UnlistenFn> = listen<{ code: number | null }>(
        `pty:exit:${sessionId}`,
        (event) => {
          console.log(`[pty ${sessionTag}] exit`, event.payload);
          handleExit(sessionId, event.payload.code);
        },
      );
      const [dataUnsub, exitUnsub] = await Promise.all([dataUnsubPromise, exitUnsubPromise]);
      console.log(`[pty ${sessionTag}] listeners registered`);
      if (disposed) {
        dataUnsub();
        exitUnsub();
      } else {
        unlistenData = dataUnsub;
        unlistenExit = exitUnsub;
      }
    })();

    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit();
      } catch {
        // host has no size yet (hidden, detached) — ignore.
      }
    });
    resizeObserver.observe(host);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      dataDisposable.dispose();
      resizeDisposable.dispose();
      if (unlistenData !== null) {
        unlistenData();
      }
      if (unlistenExit !== null) {
        unlistenExit();
      }
      term.dispose();
    };
  }, [sessionId, handleExit, fontFamily, fontSize]);

  return (
    <div
      className={cn("h-full w-full", hidden && "hidden")}
      style={{ backgroundColor: JACQLINE_THEME.background, padding: "14px 18px 18px" }}
    >
      <div ref={innerRef} className="h-full w-full overflow-hidden" />
    </div>
  );
}
