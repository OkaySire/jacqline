import { useEffect, useState } from "react";

import { gitDiff } from "@/lib/api/external";
import { cn } from "@/lib/utils";

interface PanelDiffProps {
  readonly projectId: string;
  /** Optional file scope; if omitted, diffs the whole working tree. */
  readonly relPath?: string;
}

export function PanelDiff({ projectId, relPath = "." }: PanelDiffProps) {
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled: boolean = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const out: string = await gitDiff(projectId, relPath);
        if (cancelled) {
          return;
        }
        setDiff(out);
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, relPath]);

  if (loading) {
    return <p className="text-fg-3 p-4 text-xs">Loading diff…</p>;
  }
  if (error !== null) {
    return <p className="text-destructive p-4 text-xs">{error}</p>;
  }
  if (diff === null || diff.trim() === "") {
    return <p className="text-fg-3 p-4 text-xs">No changes vs HEAD.</p>;
  }
  return (
    <pre className="px-3 py-2 font-mono text-xs leading-relaxed">
      {diff.split("\n").map((line: string, idx: number) => (
        <div key={idx} className={diffLineClass(line)}>
          {line}
        </div>
      ))}
    </pre>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return cn("text-fg-3/80");
  }
  if (line.startsWith("+")) {
    return "text-emerald-400 bg-emerald-500/10";
  }
  if (line.startsWith("-")) {
    return "text-rose-400 bg-rose-500/10";
  }
  return cn("text-fg-1");
}
