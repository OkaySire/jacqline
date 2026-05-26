import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";

import {
  updaterCheck,
  updaterDownload,
  updaterInstall,
  type DownloadedUpdate,
  type UpdateInfo,
  type UpdateProgressPayload,
} from "@/lib/api/updater";
import { cn } from "@/lib/utils";

type Phase = "idle" | "checking" | "available" | "downloading" | "ready" | "installing" | "error";

/**
 * Compact update notice that lives in the titlebar between the SystemMenu
 * and the window-control buttons. Auto-checks once on mount; user can click
 * to download + install.
 *
 * The whole flow is best-effort — we silently swallow network errors (the
 * notice just stays hidden) and only show feedback once the user clicked
 * "Install". Real release-channel UX (changelog modal, rollback, etc.)
 * lands in V0.2 with the signed updater.
 */
export function UpdateNotice() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [downloaded, setDownloaded] = useState<DownloadedUpdate | null>(null);
  const [progress, setProgress] = useState<UpdateProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to download progress emitted by the Rust side.
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let disposed: boolean = false;
    void listen<UpdateProgressPayload>("updater:progress", (event) => {
      setProgress(event.payload);
    }).then((fn: UnlistenFn) => {
      if (disposed) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      disposed = true;
      if (unlisten !== null) {
        unlisten();
      }
    };
  }, []);

  // One auto-check on mount. Failures stay silent (offline, no nightly yet).
  // Frontend console.log is intentional — when the updater "didn't run", the
  // first question is whether this effect even fired. The lines surface in
  // the DevTools console (Ctrl+Shift+I) and in any external log capture.
  useEffect(() => {
    console.log("[update-notice] mount, calling updater_check");
    let cancelled: boolean = false;
    void (async () => {
      setPhase("checking");
      try {
        const next: UpdateInfo = await updaterCheck();
        console.log("[update-notice] updater_check result", next);
        if (cancelled) {
          return;
        }
        if (next.isNewer) {
          setInfo(next);
          setPhase("available");
        } else {
          setPhase("idle");
        }
      } catch (err: unknown) {
        console.error("[update-notice] updater_check failed", err);
        if (!cancelled) {
          setPhase("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startDownload = useCallback(async (): Promise<void> => {
    if (info === null) {
      return;
    }
    setError(null);
    setPhase("downloading");
    setProgress({ downloaded: 0, total: info.sizeBytes });
    try {
      const result: DownloadedUpdate = await updaterDownload(info);
      setDownloaded(result);
      setPhase("ready");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [info]);

  const startInstall = useCallback(async (): Promise<void> => {
    if (downloaded === null) {
      return;
    }
    const ok: boolean = window.confirm("The app will close so the installer can run. Continue?");
    if (!ok) {
      return;
    }
    setError(null);
    setPhase("installing");
    try {
      await updaterInstall(downloaded.localPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [downloaded]);

  if (phase === "idle" || phase === "checking") {
    return null;
  }

  const pct: number =
    progress !== null && progress.total > 0
      ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
      : 0;

  return (
    <button
      type="button"
      className={cn(
        "jq-update-notice",
        (phase === "downloading" || phase === "installing") && "busy",
        phase === "error" && "error",
      )}
      onClick={() => {
        if (phase === "available") {
          void startDownload();
        } else if (phase === "ready") {
          void startInstall();
        }
      }}
      disabled={phase === "downloading" || phase === "installing"}
      title={
        phase === "available"
          ? `Update available · click to download`
          : phase === "downloading"
            ? `Downloading update (${String(pct)} %)…`
            : phase === "ready"
              ? `Update ready · click to install`
              : phase === "installing"
                ? "Restarting…"
                : (error ?? "Update failed")
      }
    >
      <span className="jq-update-dot" aria-hidden />
      <span className="jq-update-label">
        {phase === "available" && "Update available"}
        {phase === "downloading" && `Downloading ${String(pct)} %`}
        {phase === "ready" && "Install now"}
        {phase === "installing" && "Restarting…"}
        {phase === "error" && "Update failed"}
      </span>
      {phase === "available" && info !== null && (
        <span className="jq-update-meta">{prettyMb(info.sizeBytes)}</span>
      )}
    </button>
  );
}

function prettyMb(bytes: number): string {
  const mb: number = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
