import { ExternalLink, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";

import { CodeView } from "@/components/code-view";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shellOpenExternal } from "@/lib/api/external";
import { fsRead } from "@/lib/api/fs";
import { cn } from "@/lib/utils";
import { useFileViewerStore, type ViewerMode } from "@/stores/file-viewer";

const TEXT_DECODER: TextDecoder = new TextDecoder("utf-8", { fatal: false });
const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "ico",
  "avif",
]);
const MARKDOWN_EXTENSIONS: ReadonlySet<string> = new Set(["md", "mdx", "markdown"]);
const JSON_EXTENSIONS: ReadonlySet<string> = new Set(["json", "jsonc"]);

function extOf(name: string): string {
  const idx: number = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function mimeOf(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "ico":
      return "image/vnd.microsoft.icon";
    case "avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

interface FileContents {
  readonly bytes: Uint8Array | null;
  readonly text: string | null;
  readonly loading: boolean;
  readonly error: string | null;
}

const INITIAL_CONTENTS: FileContents = {
  bytes: null,
  text: null,
  loading: true,
  error: null,
};

export function FilePreview() {
  const selectedFile = useFileViewerStore((s) => s.selectedFile);
  const mode: ViewerMode = useFileViewerStore((s) => s.mode);
  const setMode = useFileViewerStore((s) => s.setMode);
  const closeFile = useFileViewerStore((s) => s.closeFile);

  const [contents, setContents] = useState<FileContents>(INITIAL_CONTENTS);

  // Reload contents whenever the selected file changes.
  useEffect(() => {
    if (selectedFile === null) {
      return;
    }
    let cancelled: boolean = false;
    void (async () => {
      setContents(INITIAL_CONTENTS);
      try {
        const bytes: Uint8Array = await fsRead(selectedFile.projectId, selectedFile.relPath);
        if (cancelled) {
          return;
        }
        const text: string = TEXT_DECODER.decode(bytes);
        setContents({ bytes, text, loading: false, error: null });
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        setContents({
          bytes: null,
          text: null,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFile]);

  const handleOpenExternal = useCallback((): void => {
    if (selectedFile === null) {
      return;
    }
    shellOpenExternal(selectedFile.projectId, selectedFile.relPath).catch((err: unknown) => {
      console.error("shellOpenExternal failed", err);
    });
  }, [selectedFile]);

  const handleSaved = useCallback((nextText: string): void => {
    const encoded: Uint8Array = new TextEncoder().encode(nextText);
    setContents((prev: FileContents) => ({ ...prev, bytes: encoded, text: nextText }));
  }, []);

  if (selectedFile === null) {
    return null;
  }

  const ext: string = extOf(selectedFile.name);
  const isImage: boolean = IMAGE_EXTENSIONS.has(ext);

  return (
    <div className="bg-popover border-border flex h-full min-h-0 flex-col rounded-lg border">
      <header className="border-border/60 flex items-center gap-2 border-b px-3 py-2">
        <p className="text-foreground truncate font-mono text-xs" title={selectedFile.relPath}>
          {selectedFile.relPath}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={handleOpenExternal}
            aria-label="Open in external editor"
            title="Open in external editor"
          >
            <ExternalLink className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={closeFile}
            aria-label="Close preview"
            title="Close preview"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      </header>
      <div className="border-border/60 border-b px-3 py-2">
        <Tabs value={mode} onValueChange={(v: string) => setMode(v as ViewerMode)}>
          <TabsList className="bg-card/60 h-7 w-full">
            <TabsTrigger value="preview" className="h-5 text-xs">
              Preview
            </TabsTrigger>
            <TabsTrigger value="code" className="h-5 text-xs">
              Code
            </TabsTrigger>
            <TabsTrigger value="edit" className="h-5 text-xs">
              Edit
            </TabsTrigger>
            <TabsTrigger value="diff" className="h-5 text-xs">
              Diff
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className={cn("min-h-0 flex-1 overflow-auto")}>
        {contents.loading && <p className="text-muted-foreground p-3 text-xs">Loading…</p>}
        {contents.error !== null && (
          <p className="text-destructive p-3 text-xs">{contents.error}</p>
        )}
        {!contents.loading && contents.error === null && (
          <PreviewBody
            mode={mode}
            file={selectedFile}
            ext={ext}
            isImage={isImage}
            bytes={contents.bytes}
            text={contents.text}
            onSaved={handleSaved}
          />
        )}
      </div>
    </div>
  );
}

interface PreviewBodyProps {
  readonly mode: ViewerMode;
  readonly file: { projectId: string; relPath: string; name: string };
  readonly ext: string;
  readonly isImage: boolean;
  readonly bytes: Uint8Array | null;
  readonly text: string | null;
  readonly onSaved: (nextText: string) => void;
}

function PreviewBody({ mode, file, ext, isImage, bytes, text, onSaved }: PreviewBodyProps) {
  if (mode === "diff") {
    return <DiffView projectId={file.projectId} relPath={file.relPath} />;
  }

  if (mode === "preview") {
    if (isImage && bytes !== null) {
      return <ImagePreview bytes={bytes} ext={ext} alt={file.name} />;
    }
    if (MARKDOWN_EXTENSIONS.has(ext) && text !== null) {
      return <MarkdownPreview text={text} />;
    }
    if (JSON_EXTENSIONS.has(ext) && text !== null) {
      return <JsonPreview text={text} />;
    }
    if (text !== null) {
      return <PlainTextPreview text={text} />;
    }
    return <p className="text-muted-foreground p-3 text-xs">No preview available.</p>;
  }

  // code | edit modes
  if (text === null) {
    return <p className="text-muted-foreground p-3 text-xs">Binary file — cannot edit.</p>;
  }
  return (
    <CodeView
      key={`${file.projectId}:${file.relPath}:${mode}`}
      text={text}
      filename={file.name}
      editable={mode === "edit"}
      projectId={file.projectId}
      relPath={file.relPath}
      onSaved={onSaved}
    />
  );
}

interface ImagePreviewProps {
  readonly bytes: Uint8Array;
  readonly ext: string;
  readonly alt: string;
}

function ImagePreview({ bytes, ext, alt }: ImagePreviewProps) {
  const url: string = useMemo(() => {
    // ArrayBufferLike is the canonical type Blob accepts; bytes.buffer is a
    // SharedArrayBuffer | ArrayBuffer union depending on the source. We always
    // produced it from a fresh Uint8Array, so it's a plain ArrayBuffer.
    const blob: Blob = new Blob([new Uint8Array(bytes).buffer], { type: mimeOf(ext) });
    return URL.createObjectURL(blob);
  }, [bytes, ext]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [url]);

  return (
    <div className="flex h-full items-center justify-center p-3">
      <img src={url} alt={alt} className="max-h-full max-w-full object-contain" />
    </div>
  );
}

function MarkdownPreview({ text }: { readonly text: string }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none px-4 py-3 text-sm leading-relaxed">
      <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{text}</ReactMarkdown>
    </div>
  );
}

function JsonPreview({ text }: { readonly text: string }) {
  const pretty: string = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }, [text]);

  return (
    <pre className="text-foreground/90 px-3 py-2 font-mono text-xs whitespace-pre-wrap">
      {pretty}
    </pre>
  );
}

function PlainTextPreview({ text }: { readonly text: string }) {
  return (
    <pre className="text-foreground/90 px-3 py-2 font-mono text-xs whitespace-pre-wrap">{text}</pre>
  );
}

interface DiffViewProps {
  readonly projectId: string;
  readonly relPath: string;
}

function DiffView({ projectId, relPath }: DiffViewProps) {
  const [diff, setDiff] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled: boolean = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const { gitDiff } = await import("@/lib/api/external");
        const result: string = await gitDiff(projectId, relPath);
        if (cancelled) {
          return;
        }
        setDiff(result);
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
    return <p className="text-muted-foreground p-3 text-xs">Loading diff…</p>;
  }
  if (error !== null) {
    return <p className="text-destructive p-3 text-xs">{error}</p>;
  }
  if (diff === null || diff.trim() === "") {
    return <p className="text-muted-foreground p-3 text-xs">No changes vs HEAD.</p>;
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
    return "text-muted-foreground/70";
  }
  if (line.startsWith("+")) {
    return "text-emerald-400 bg-emerald-500/10";
  }
  if (line.startsWith("-")) {
    return "text-rose-400 bg-rose-500/10";
  }
  return "text-foreground/80";
}
