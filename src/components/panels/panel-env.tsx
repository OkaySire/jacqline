import { useEffect, useMemo, useState } from "react";

import { I } from "@/components/icons";
import { sessionEnvSnapshot, type EnvVar, type SessionEnvSnapshot } from "@/lib/api/session-env";
import { useActiveSession } from "@/stores/sessions";

/**
 * Inspector panel for the active session's environment variables.
 * Backed by the `session_env_snapshot` Tauri command. Same shape as the
 * Debug panel: header + filterable list + Copy-as-Markdown button.
 *
 * Redaction happens **in Rust** — names matching the keyword list lose
 * their values before they leave the process. The Copy output also
 * carries the redaction, so a snapshot the user pastes into a bug
 * report can't leak secrets by accident.
 */
export function PanelEnv({ projectId }: { readonly projectId: string }) {
  const activeSession = useActiveSession(projectId);
  const sessionId: string | null = activeSession?.id ?? null;

  const [snap, setSnap] = useState<SessionEnvSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [query, setQuery] = useState<string>("");

  useEffect(() => {
    // Defer to next tick so the synchronous setState calls inside the
    // fetch path don't trip react-hooks/set-state-in-effect.
    let cancelled: boolean = false;
    const tid: number = window.setTimeout(() => {
      if (sessionId === null) {
        setSnap(null);
        return;
      }
      setLoading(true);
      setError(null);
      sessionEnvSnapshot(sessionId)
        .then((next: SessionEnvSnapshot) => {
          if (!cancelled) {
            setSnap(next);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : String(err));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [sessionId]);

  function refresh(): void {
    if (sessionId === null) {
      return;
    }
    setLoading(true);
    setError(null);
    sessionEnvSnapshot(sessionId)
      .then((next: SessionEnvSnapshot) => {
        setSnap(next);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  async function handleCopy(): Promise<void> {
    if (snap === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(formatMarkdown(snap));
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const filtered: readonly EnvVar[] = useMemo(() => {
    if (snap === null) {
      return [];
    }
    const q: string = query.trim().toLowerCase();
    if (q === "") {
      return snap.vars;
    }
    return snap.vars.filter(
      (v: EnvVar) =>
        v.name.toLowerCase().includes(q) || (!v.redacted && v.value.toLowerCase().includes(q)),
    );
  }, [snap, query]);

  const redactedCount: number = useMemo(
    () => (snap === null ? 0 : snap.vars.filter((v: EnvVar) => v.redacted).length),
    [snap],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-line-soft flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-fg-1 text-xs font-medium">Session env</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="text-fg-2 hover:text-fg-0 inline-flex items-center gap-1 text-[11px]"
            disabled={loading || sessionId === null}
            title="Refresh"
          >
            <I.refresh />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="bg-accent-soft text-accent-fg border-accent-line hover:bg-accent/30 inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px]"
            disabled={loading || snap === null}
          >
            <I.copy />
            {copied ? "Copied" : "Copy as Markdown"}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {sessionId === null && (
          <p className="text-fg-3 text-xs">No active session — open one to inspect its env.</p>
        )}
        {sessionId !== null && loading && <p className="text-fg-3 text-xs">Loading…</p>}
        {error !== null && <p className="text-destructive text-xs">{error}</p>}
        {snap !== null && !loading && (
          <div className="flex min-w-0 flex-col gap-3">
            <Header
              snap={snap}
              redactedCount={redactedCount}
              claudeId={activeSession?.claudeId ?? ""}
              claudeVersion={activeSession?.claudeVersion ?? ""}
            />
            {snap.error !== null && (
              <div className="bg-bg-2/40 border-line-soft text-fg-2 rounded-md border p-3 text-[11px]">
                <p className="font-medium">Capture failed</p>
                <p className="mt-1 font-mono text-[10.5px]">{snap.error}</p>
              </div>
            )}
            {snap.vars.length > 0 && (
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter (name or value)"
                className="bg-bg-2/40 border-line-soft text-fg-1 placeholder:text-fg-3 rounded-md border px-2 py-1 text-[11px] outline-none focus:border-violet-500/60"
              />
            )}
            <div className="grid w-full grid-cols-[minmax(140px,30%)_1fr] font-mono text-[10.5px]">
              {filtered.map((v: EnvVar) => (
                <div key={v.name} className="contents">
                  <div
                    className="text-fg-1 border-line-soft/50 truncate border-b py-1 pr-3"
                    title={v.name}
                  >
                    {v.name}
                  </div>
                  <div
                    className={
                      v.redacted
                        ? "text-accent-fg border-line-soft/50 border-b py-1"
                        : "text-fg-2 border-line-soft/50 min-w-0 border-b py-1"
                    }
                  >
                    {v.redacted ? (
                      <span className="bg-accent-soft border-accent-line rounded border px-1.5 py-0.5 text-[10px]">
                        REDACTED
                      </span>
                    ) : (
                      <span className="break-all">{v.value}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {filtered.length === 0 && snap.vars.length > 0 && (
              <p className="text-fg-3 text-[11px]">No vars match {`"${query}"`}.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Header({
  snap,
  redactedCount,
  claudeId,
  claudeVersion,
}: {
  readonly snap: SessionEnvSnapshot;
  readonly redactedCount: number;
  readonly claudeId: string;
  readonly claudeVersion: string;
}) {
  const claudeLabel: string =
    claudeId === ""
      ? "(not yet intercepted)"
      : claudeVersion === ""
        ? claudeId
        : `${claudeId} (v${claudeVersion})`;
  return (
    <section className="bg-bg-2/40 border-line-soft min-w-0 rounded-md border p-3">
      <KV label="Session" value={`${snap.sessionName} (${snap.sessionId.slice(0, 8)})`} />
      <KV label="Claude" value={claudeLabel} />
      <KV label="Shell" value={snap.shell} />
      <KV label="CWD" value={snap.cwd} />
      <KV label="PID" value={String(snap.pid)} />
      <KV label="Captured" value={new Date(snap.generatedAt).toISOString()} />
      <KV label="Method" value={snap.captureMethod} />
      <KV
        label="Vars"
        value={`${String(snap.vars.length)} total, ${String(redactedCount)} redacted`}
      />
    </section>
  );
}

function KV({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-fg-3 shrink-0 text-[11px]">{label}</span>
      <span className="text-fg-1 truncate font-mono text-[10.5px]" title={value}>
        {value}
      </span>
    </div>
  );
}

function formatMarkdown(snap: SessionEnvSnapshot): string {
  const lines: string[] = [];
  lines.push("# Jacqline session env");
  lines.push("");
  lines.push(`**Session:** ${snap.sessionName} (\`${snap.sessionId.slice(0, 8)}\`)`);
  lines.push(`**Shell:** \`${snap.shell}\``);
  lines.push(`**CWD:** \`${snap.cwd}\``);
  lines.push(`**PID:** ${String(snap.pid)}`);
  lines.push(`**Captured:** ${new Date(snap.generatedAt).toISOString()}`);
  lines.push(`**Method:** \`${snap.captureMethod}\``);
  if (snap.error !== null) {
    lines.push("");
    lines.push("## Capture failed");
    lines.push("```");
    lines.push(snap.error);
    lines.push("```");
    return lines.join("\n");
  }
  const redactedCount: number = snap.vars.filter((v: EnvVar) => v.redacted).length;
  lines.push("");
  lines.push(`## Variables (${String(snap.vars.length)} total, ${String(redactedCount)} redacted)`);
  lines.push("");
  lines.push("```");
  for (const v of snap.vars) {
    lines.push(`${v.name}=${v.redacted ? "REDACTED" : v.value}`);
  }
  lines.push("```");
  return lines.join("\n");
}
