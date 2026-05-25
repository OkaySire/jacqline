import {
  ChevronDown,
  ChevronRight,
  File as FileIcon,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactElement } from "react";

import { fsList } from "@/lib/api/fs";
import { cn } from "@/lib/utils";
import type { DirEntry } from "@/types/fs";

interface FileTreeProps {
  readonly projectId: string;
}

/**
 * State of a single directory's listing. While the fetch is in flight, the
 * entry is simply absent from `childrenByPath`; the renderer treats that as
 * an implicit "loading" state. Doing it this way avoids a synchronous
 * `setState` inside the `useEffect` that kicks off the initial load (which
 * `react-hooks/set-state-in-effect` correctly flags as a cascading-render
 * trap).
 */
interface ChildrenState {
  readonly status: "loaded" | "error";
  readonly entries?: readonly DirEntry[];
  readonly error?: string;
}

/**
 * Read-only project file browser. Lazy-loads each directory on first expand.
 * No `.gitignore` filtering in MVP — we show everything; user can scroll past
 * `node_modules` for now.
 */
export function FileTree({ projectId }: FileTreeProps) {
  const [childrenByPath, setChildrenByPath] = useState<ReadonlyMap<string, ChildrenState>>(
    new Map(),
  );
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set([""]));

  const loadDir = useCallback(
    (relPath: string): void => {
      fsList(projectId, relPath)
        .then((entries: DirEntry[]) => {
          setChildrenByPath((prev) => {
            const next: Map<string, ChildrenState> = new Map(prev);
            next.set(relPath, { status: "loaded", entries });
            return next;
          });
        })
        .catch((err: unknown) => {
          const message: string = err instanceof Error ? err.message : String(err);
          setChildrenByPath((prev) => {
            const next: Map<string, ChildrenState> = new Map(prev);
            next.set(relPath, { status: "error", error: message });
            return next;
          });
        });
    },
    [projectId],
  );

  // Load the root listing on mount. The parent (`RightPanel`) keys this
  // component by `projectId`, so a project switch remounts FileTree with
  // fresh state instead of needing a manual reset here.
  useEffect(() => {
    loadDir("");
  }, [loadDir]);

  const toggleDir = useCallback(
    (relPath: string): void => {
      setExpanded((prev) => {
        const next: Set<string> = new Set(prev);
        if (next.has(relPath)) {
          next.delete(relPath);
        } else {
          next.add(relPath);
        }
        return next;
      });
      // Lazy-load on first expand. Reading `childrenByPath` directly (rather
      // than inside a state updater) keeps the side-effect outside the React
      // render pipeline.
      if (!childrenByPath.has(relPath)) {
        loadDir(relPath);
      }
    },
    [loadDir, childrenByPath],
  );

  const rootState: ChildrenState | undefined = childrenByPath.get("");

  return (
    <div className="font-mono text-xs">
      {rootState === undefined && <p className="text-muted-foreground px-2 py-1">Loading…</p>}
      {rootState?.status === "error" && (
        <p className="text-destructive px-2 py-1">{rootState.error ?? "Failed to list root."}</p>
      )}
      {rootState?.status === "loaded" && rootState.entries !== undefined && (
        <TreeChildren
          entries={rootState.entries}
          parentPath=""
          depth={0}
          expanded={expanded}
          childrenByPath={childrenByPath}
          onToggleDir={toggleDir}
        />
      )}
    </div>
  );
}

interface TreeChildrenProps {
  readonly entries: readonly DirEntry[];
  readonly parentPath: string;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly childrenByPath: ReadonlyMap<string, ChildrenState>;
  readonly onToggleDir: (relPath: string) => void;
}

function TreeChildren({
  entries,
  parentPath,
  depth,
  expanded,
  childrenByPath,
  onToggleDir,
}: TreeChildrenProps) {
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground/70 px-2 py-1" style={{ paddingLeft: indentPx(depth) }}>
        (empty)
      </p>
    );
  }
  return (
    <ul>
      {entries.map((entry: DirEntry) => {
        const childPath: string = parentPath === "" ? entry.name : `${parentPath}/${entry.name}`;
        return (
          <TreeRow
            key={childPath}
            entry={entry}
            path={childPath}
            depth={depth}
            expanded={expanded}
            childrenByPath={childrenByPath}
            onToggleDir={onToggleDir}
          />
        );
      })}
    </ul>
  );
}

interface TreeRowProps {
  readonly entry: DirEntry;
  readonly path: string;
  readonly depth: number;
  readonly expanded: ReadonlySet<string>;
  readonly childrenByPath: ReadonlyMap<string, ChildrenState>;
  readonly onToggleDir: (relPath: string) => void;
}

function TreeRow({ entry, path, depth, expanded, childrenByPath, onToggleDir }: TreeRowProps) {
  const isDir: boolean = entry.kind === "dir";
  const isOpen: boolean = isDir && expanded.has(path);
  const childState: ChildrenState | undefined = isDir ? childrenByPath.get(path) : undefined;
  const iconClass: string = cn(
    "size-3.5 shrink-0",
    isDir ? "text-primary/80" : "text-muted-foreground",
  );

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (isDir) {
            onToggleDir(path);
          }
        }}
        className={cn(
          "hover:bg-popover/60 flex h-7 w-full items-center gap-1 rounded px-1 text-left text-xs transition-colors",
          !isDir && "cursor-default",
        )}
        style={{ paddingLeft: indentPx(depth) }}
      >
        {isDir ? (
          isOpen ? (
            <ChevronDown className="text-muted-foreground size-3 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground size-3 shrink-0" />
          )
        ) : (
          <span className="inline-block w-3 shrink-0" aria-hidden />
        )}
        {isDir ? (
          isOpen ? (
            <FolderOpen className={iconClass} />
          ) : (
            <Folder className={iconClass} />
          )
        ) : (
          fileIconFor(entry.name, iconClass)
        )}
        <span className="truncate">{entry.name}</span>
      </button>
      {isDir && isOpen && (
        <>
          {childState === undefined && (
            <p
              className="text-muted-foreground/70 px-2 py-1 text-xs"
              style={{ paddingLeft: indentPx(depth + 1) }}
            >
              Loading…
            </p>
          )}
          {childState?.status === "error" && (
            <p
              className="text-destructive px-2 py-1 text-xs"
              style={{ paddingLeft: indentPx(depth + 1) }}
            >
              {childState.error ?? "Failed to list."}
            </p>
          )}
          {childState?.status === "loaded" && childState.entries !== undefined && (
            <TreeChildren
              entries={childState.entries}
              parentPath={path}
              depth={depth + 1}
              expanded={expanded}
              childrenByPath={childrenByPath}
              onToggleDir={onToggleDir}
            />
          )}
        </>
      )}
    </li>
  );
}

const INDENT_PX: number = 12;
function indentPx(depth: number): number {
  return 4 + depth * INDENT_PX;
}

const TEXT_EXTENSIONS: readonly string[] = [".md", ".mdx", ".txt"];
const JSON_EXTENSIONS: readonly string[] = [".json", ".jsonc", ".yaml", ".yml", ".toml"];
const CODE_EXTENSIONS: readonly string[] = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".rs",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".sh",
  ".bash",
  ".zsh",
  ".ps1",
];

function fileIconFor(filename: string, className: string): ReactElement {
  const lower: string = filename.toLowerCase();
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return <FileText className={className} />;
  }
  if (JSON_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return <FileJson className={className} />;
  }
  if (CODE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return <FileCode className={className} />;
  }
  return <FileIcon className={className} />;
}
