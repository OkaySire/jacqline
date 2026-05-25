import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

import { fsRead } from "@/lib/api/fs";

interface PanelFileProps {
  readonly projectId: string;
  readonly relPath: string;
}

const TEXT_DECODER: TextDecoder = new TextDecoder("utf-8", { fatal: false });
const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set(["md", "mdx", "markdown"]);

function extOf(name: string): string {
  const idx: number = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

/**
 * Renders a single file inside an inspector tab. Markdown is rendered via
 * `react-markdown`; everything else falls back to a `<pre>` block. Code-mode
 * + git-diff variants land in V0.2 when we factor out the rich viewer from
 * `file-preview.tsx`.
 */
export function PanelFile({ projectId, relPath }: PanelFileProps) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled: boolean = false;
    void (async () => {
      try {
        const bytes: Uint8Array = await fsRead(projectId, relPath);
        if (cancelled) {
          return;
        }
        setText(TEXT_DECODER.decode(bytes));
        setError(null);
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setText(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, relPath]);

  if (error !== null) {
    return <p className="text-destructive p-4 text-xs">{error}</p>;
  }
  if (text === null) {
    return <p className="text-fg-3 p-4 text-xs">Loading…</p>;
  }

  const ext: string = extOf(relPath);
  if (MARKDOWN_EXTENSIONS.has(ext)) {
    return (
      <div className="prose prose-invert prose-sm max-w-none px-4 py-3 text-sm leading-relaxed">
        <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{text}</ReactMarkdown>
      </div>
    );
  }
  return (
    <pre className="text-fg-1 px-4 py-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
      {text}
    </pre>
  );
}
