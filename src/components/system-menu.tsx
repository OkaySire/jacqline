import { useEffect, useRef, useState } from "react";

import { I } from "@/components/icons";
import { UPDATE_CHECK_EVENT } from "@/components/update-notice";
import { cn } from "@/lib/utils";

interface SystemStats {
  readonly cpuPct: number;
  readonly memPct: number;
  readonly diskPct: number;
  readonly netKbps: number;
}

/**
 * Phase G ships the UI shell + a mock data poller. The real
 * `system_stats` Tauri command (Rust `sysinfo` crate) lands in V0.2 — when
 * it does, swap `fakeStats` for `invoke<RawSystemStats>("system_stats")`.
 */
function fakeStats(): SystemStats {
  const jitter = (base: number, spread: number): number => {
    return Math.max(0, Math.min(100, base + (Math.random() - 0.5) * spread));
  };
  return {
    cpuPct: jitter(24, 10),
    memPct: jitter(52, 4),
    diskPct: 38,
    netKbps: jitter(110, 60),
  };
}

export function SystemMenu() {
  const [stats, setStats] = useState<SystemStats>(() => fakeStats());
  const [open, setOpen] = useState<boolean>(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Refresh every 1.5s while mounted. Cheap (no actual command yet); when the
  // real backend lands we'll throttle differently.
  useEffect(() => {
    const id = window.setInterval(() => {
      setStats(fakeStats());
    }, 1500);
    return () => {
      window.clearInterval(id);
    };
  }, []);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDoc = (event: MouseEvent): void => {
      if (ref.current !== null && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="jq-sysmenu" ref={ref}>
      <button
        type="button"
        className={cn("jq-sysmenu-trigger", open && "active")}
        onClick={() => setOpen((v: boolean) => !v)}
        title="System usage"
      >
        <I.cpu className="text-fg-2" />
        <span className="jq-sysmenu-trigger-pct">{Math.round(stats.cpuPct)}%</span>
      </button>
      {open && (
        <div className="jq-sysmenu-popover" role="menu">
          <header className="jq-sysmenu-header">
            <p className="text-fg-0 text-sm font-medium">Système local</p>
            <p className="text-fg-3 font-mono text-xs">
              {process.platform === "darwin"
                ? "macOS"
                : process.platform === "win32"
                  ? "Windows"
                  : "Linux"}
            </p>
          </header>
          <Gauge label="CPU" value={stats.cpuPct} unit="%" />
          <Gauge label="Mémoire" value={stats.memPct} unit="%" />
          <Gauge label="Disque" value={stats.diskPct} unit="%" />
          <Gauge label="Réseau" value={stats.netKbps} unit=" kB/s" max={500} />
          <p className="text-fg-3 mt-2 text-[10.5px]">Live system stats land in V0.2.</p>
          <button
            type="button"
            className="border-line-soft text-fg-1 hover:bg-bg-2 mt-3 flex w-full items-center justify-center gap-2 rounded border px-3 py-2 text-xs"
            onClick={() => {
              window.dispatchEvent(new CustomEvent(UPDATE_CHECK_EVENT));
              setOpen(false);
            }}
          >
            <I.refresh />
            Check for updates
          </button>
        </div>
      )}
    </div>
  );
}

function Gauge({
  label,
  value,
  unit,
  max = 100,
}: {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly max?: number;
}) {
  const pct: number = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="jq-sysmenu-gauge">
      <div className="jq-sysmenu-gauge-row">
        <span className="text-fg-1 text-xs">{label}</span>
        <span className="text-fg-2 font-mono text-[11px]">
          {Math.round(value)}
          {unit}
        </span>
      </div>
      <div className="jq-sysmenu-gauge-bar">
        <div className="jq-sysmenu-gauge-fill" style={{ width: `${String(pct)}%` }} />
      </div>
    </div>
  );
}
