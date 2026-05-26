import { useEffect, useState } from "react";

import { I } from "@/components/icons";
import { debugSnapshot, type DebugSnapshot, type RecentExit } from "@/lib/api/debug";
import { getConsoleRing, type ConsoleRingEntry } from "@/lib/console-ring";

/**
 * One-stop debug snapshot panel. Calls `debug_snapshot` on mount, renders
 * the result as a stack of small cards, and ships a "Copy as Markdown"
 * button that flattens everything to a paste-ready string for the bus
 * paste box.
 */
export function PanelDebug() {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    // Initial fetch: setState happens only in the resolved promise
    // callbacks, not synchronously inside the effect body — that keeps the
    // react-hooks/set-state-in-effect rule happy.
    let cancelled: boolean = false;
    debugSnapshot()
      .then((next: DebugSnapshot) => {
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
    return () => {
      cancelled = true;
    };
  }, []);

  function refresh(): void {
    setLoading(true);
    setError(null);
    debugSnapshot()
      .then((next: DebugSnapshot) => {
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-line-soft flex items-center justify-between gap-2 border-b px-3 py-2">
        <p className="text-fg-1 text-xs font-medium">Debug snapshot</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="text-fg-2 hover:text-fg-0 inline-flex items-center gap-1 text-[11px]"
            disabled={loading}
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
        {loading && <p className="text-fg-3 text-xs">Loading…</p>}
        {error !== null && <p className="text-destructive text-xs">{error}</p>}
        {snap !== null && !loading && <SnapshotBody snap={snap} />}
      </div>
    </div>
  );
}

function SnapshotBody({ snap }: { readonly snap: DebugSnapshot }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Section title="Identity">
        <KV label="App version" value={snap.appVersion} mono />
        <KV label="Generated" value={new Date(snap.timestampMs).toISOString()} mono />
        <KV label="App data" value={snap.appDataDir} mono small />
        <KV label="Log dir" value={snap.logDir} mono small />
        <KV label="Log file" value={snap.logPath} mono small />
      </Section>
      <Section title="OS">
        <KV label="Name" value={snap.os.name} mono />
        <KV label="Arch" value={snap.os.arch} mono />
        <KV label="Family" value={snap.os.family} mono />
      </Section>
      {snap.wslDistros.length > 0 && (
        <Section title="WSL distros">
          <ul className="font-mono text-xs">
            {snap.wslDistros.map((d: string) => (
              <li key={d}>· {d}</li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Database">
        <KV label="Projects" value={String(snap.dbStats.projectsCount)} mono />
        <KV
          label="Sessions"
          value={`${snap.dbStats.sessionsTotal} (running ${snap.dbStats.sessionsRunning}, idle ${snap.dbStats.sessionsIdle}, stopped ${snap.dbStats.sessionsStopped})`}
          mono
        />
      </Section>
      {snap.recentSessionExits.length > 0 && (
        <Section title="Recent session exits">
          <table className="w-full text-left font-mono text-[10.5px]">
            <thead className="text-fg-3">
              <tr>
                <th className="pr-2 pb-1 font-normal">name</th>
                <th className="pr-2 pb-1 font-normal">status</th>
                <th className="pb-1 font-normal">ended</th>
              </tr>
            </thead>
            <tbody>
              {snap.recentSessionExits.map((row: RecentExit) => (
                <tr key={row.sessionId} className="text-fg-1">
                  <td className="pr-2 align-top">{row.name}</td>
                  <td className="pr-2 align-top">{row.status}</td>
                  <td className="align-top">
                    {row.endedAt !== null ? new Date(row.endedAt).toISOString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <Section title="Updater">
        <KV label="Current SHA" value={snap.updater.currentSha} mono small />
        <KV label="Last installed SHA" value={snap.updater.lastSeenSha ?? "(never)"} mono small />
      </Section>
      <Section title="PATH preview (redacted)">
        <pre className="text-fg-2 max-h-32 w-full min-w-0 overflow-auto font-mono text-[10.5px] break-all whitespace-pre-wrap">
          {snap.pathPreview === "" ? "(empty)" : snap.pathPreview}
        </pre>
      </Section>
      <Section title={`Recent logs (last ${String(snap.recentLogs.length)} lines)`}>
        <pre className="text-fg-2 max-h-60 w-full min-w-0 overflow-auto font-mono text-[10.5px] whitespace-pre">
          {snap.recentLogs.length === 0 ? "(no log file yet)" : snap.recentLogs.join("\n")}
        </pre>
      </Section>
      <ConsoleRingSection />
    </div>
  );
}

function ConsoleRingSection() {
  const entries: readonly ConsoleRingEntry[] = getConsoleRing();
  return (
    <Section title={`Recent console events (last ${String(entries.length)})`}>
      <pre className="text-fg-2 max-h-60 w-full min-w-0 overflow-auto font-mono text-[10.5px] whitespace-pre">
        {entries.length === 0 ? "(no console activity yet)" : formatRing(entries)}
      </pre>
    </Section>
  );
}

function formatRing(entries: readonly ConsoleRingEntry[]): string {
  return entries
    .map((e: ConsoleRingEntry): string => {
      const iso: string = new Date(e.ts).toISOString().slice(11, 23);
      return `[${iso}] ${e.level.padEnd(5)} ${e.text}`;
    })
    .join("\n");
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="bg-bg-2/40 border-line-soft min-w-0 rounded-md border p-3">
      <h3 className="text-fg-3 mb-2 text-[10.5px] font-semibold tracking-wider uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function KV({
  label,
  value,
  mono,
  small,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
  readonly small?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-fg-3 shrink-0 text-[11px]">{label}</span>
      <span
        className={
          mono === true
            ? small === true
              ? "text-fg-1 truncate font-mono text-[10px]"
              : "text-fg-1 truncate font-mono text-[11px]"
            : "text-fg-1 truncate text-xs"
        }
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function formatMarkdown(snap: DebugSnapshot): string {
  const lines: string[] = [];
  lines.push("# Jacqline Debug Snapshot");
  lines.push("");
  lines.push(`**App version:** ${snap.appVersion}`);
  lines.push(`**Generated:** ${new Date(snap.timestampMs).toISOString()}`);
  lines.push(`**App data:** \`${snap.appDataDir}\``);
  lines.push(`**Log dir:** \`${snap.logDir}\``);
  lines.push(`**Log file:** \`${snap.logPath}\``);
  lines.push("");
  lines.push("## OS");
  lines.push(`- Name: \`${snap.os.name}\``);
  lines.push(`- Arch: \`${snap.os.arch}\``);
  lines.push(`- Family: \`${snap.os.family}\``);
  if (snap.wslDistros.length > 0) {
    lines.push("");
    lines.push("## WSL distros");
    for (const d of snap.wslDistros) {
      lines.push(`- ${d}`);
    }
  }
  lines.push("");
  lines.push("## Database");
  lines.push(`- Projects: ${String(snap.dbStats.projectsCount)}`);
  lines.push(
    `- Sessions: ${String(snap.dbStats.sessionsTotal)} (running ${String(snap.dbStats.sessionsRunning)}, idle ${String(snap.dbStats.sessionsIdle)}, stopped ${String(snap.dbStats.sessionsStopped)})`,
  );
  if (snap.recentSessionExits.length > 0) {
    lines.push("");
    lines.push("## Recent session exits");
    lines.push("| name | status | ended_at |");
    lines.push("| --- | --- | --- |");
    for (const row of snap.recentSessionExits) {
      const ended: string = row.endedAt !== null ? new Date(row.endedAt).toISOString() : "—";
      lines.push(`| ${row.name} | ${row.status} | ${ended} |`);
    }
  }
  lines.push("");
  lines.push("## Updater");
  lines.push(`- Current SHA: \`${snap.updater.currentSha}\``);
  lines.push(`- Last installed SHA: \`${snap.updater.lastSeenSha ?? "(never)"}\``);
  lines.push("");
  lines.push("## PATH preview (redacted)");
  lines.push("```");
  lines.push(snap.pathPreview === "" ? "(empty)" : snap.pathPreview);
  lines.push("```");
  lines.push("");
  lines.push(`## Recent logs (last ${String(snap.recentLogs.length)} lines)`);
  lines.push("```");
  lines.push(snap.recentLogs.length === 0 ? "(no log file yet)" : snap.recentLogs.join("\n"));
  lines.push("```");
  const ring: readonly ConsoleRingEntry[] = getConsoleRing();
  lines.push("");
  lines.push(`## Recent console events (last ${String(ring.length)})`);
  lines.push("```");
  lines.push(ring.length === 0 ? "(no console activity yet)" : formatRing(ring));
  lines.push("```");
  return lines.join("\n");
}
