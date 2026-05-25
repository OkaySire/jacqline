import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal as XTermTerminal, type ITheme } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import "@xterm/xterm/css/xterm.css";

import { ptyResize, ptyWrite } from "@/lib/api/sessions";
import { cn } from "@/lib/utils";
import { useSessionsStore } from "@/stores/sessions";

const JACQLINE_THEME: ITheme = {
  background: "#0a0a0a",
  foreground: "#f2f2f2",
  cursor: "#7c3aed",
  cursorAccent: "#0a0a0a",
  selectionBackground: "#2e2b29",
  selectionForeground: "#f2f2f2",
  // Standard 16-color ANSI palette tuned to read well on the warm dark bg.
  black: "#181614",
  red: "#f06565",
  green: "#7ec27a",
  yellow: "#e8c468",
  blue: "#7aa6f0",
  magenta: "#b48ef0",
  cyan: "#6cc6c2",
  white: "#d4d2cf",
  brightBlack: "#5a5754",
  brightRed: "#ff7d7d",
  brightGreen: "#9adf91",
  brightYellow: "#ffd986",
  brightBlue: "#9ec2ff",
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
 * The component **does not** kill the session on unmount — that's the
 * responsibility of the sessions store. Setting `hidden` toggles CSS
 * visibility while keeping the xterm instance (and its scrollback) alive so
 * switching between projects doesn't reset history.
 */
export function Terminal({ sessionId, hidden = false }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handleExit = useSessionsStore((s) => s.handleExit);

  useEffect(() => {
    const host: HTMLDivElement | null = containerRef.current;
    if (host === null) {
      return;
    }

    const term = new XTermTerminal({
      theme: JACQLINE_THEME,
      fontFamily: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
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

    void (async () => {
      const dataUnsubPromise: Promise<UnlistenFn> = listen<number[]>(
        `pty:data:${sessionId}`,
        (event) => {
          term.write(new Uint8Array(event.payload));
        },
      );
      const exitUnsubPromise: Promise<UnlistenFn> = listen<{ code: number | null }>(
        `pty:exit:${sessionId}`,
        (event) => {
          handleExit(sessionId, event.payload.code);
        },
      );
      const [dataUnsub, exitUnsub] = await Promise.all([dataUnsubPromise, exitUnsubPromise]);
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
  }, [sessionId, handleExit]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden", hidden && "hidden")}
      style={{ backgroundColor: JACQLINE_THEME.background }}
    />
  );
}
