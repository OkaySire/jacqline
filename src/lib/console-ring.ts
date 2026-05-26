/**
 * Last-100 ring buffer that mirrors everything the app writes to
 * `console.log` / `info` / `warn` / `error`. The Debug panel reads from
 * here so a user without devtools (release build, F12 blocked, etc.)
 * can still ship us the frontend trace by copying the snapshot as
 * markdown.
 *
 * Install once from `main.tsx` BEFORE the app renders. After install,
 * `console.*` keeps behaving identically — the original call is still
 * invoked, the ring just gets a copy.
 */

export interface ConsoleRingEntry {
  readonly ts: number;
  readonly level: "log" | "info" | "warn" | "error";
  readonly text: string;
}

const RING_MAX: number = 200;
const RING: ConsoleRingEntry[] = [];
let installed: boolean = false;

export function installConsoleRing(): void {
  if (installed || typeof console === "undefined") {
    return;
  }
  installed = true;
  const levels = ["log", "info", "warn", "error"] as const;
  for (const level of levels) {
    const orig: (...args: unknown[]) => void = console[level].bind(console);
    console[level] = (...args: unknown[]): void => {
      try {
        const text: string = args.map(formatArg).join(" ");
        RING.push({ ts: Date.now(), level, text });
        if (RING.length > RING_MAX) {
          RING.shift();
        }
      } catch {
        // Never let the ring throw — better to lose the entry than to
        // break the original console call.
      }
      orig(...args);
    };
  }
}

export function getConsoleRing(): readonly ConsoleRingEntry[] {
  return RING;
}

function formatArg(arg: unknown): string {
  if (typeof arg === "string") {
    return arg;
  }
  if (arg instanceof Error) {
    return `${arg.name}: ${arg.message}`;
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}
