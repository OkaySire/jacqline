import { useCallback, useEffect, useState } from "react";

import { I } from "@/components/icons";
import { fsList } from "@/lib/api/fs";
import { cn } from "@/lib/utils";
import { useFileViewerStore } from "@/stores/file-viewer";
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
  const openFile = useFileViewerStore((s) => s.openFile);
  const selectedFile = useFileViewerStore((s) => s.selectedFile);
  const activeRelPath: string | null =
    selectedFile !== null && selectedFile.projectId === projectId ? selectedFile.relPath : null;

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

  const handleFileClick = useCallback(
    (relPath: string, name: string): void => {
      openFile({ projectId, relPath, name });
    },
    [openFile, projectId],
  );

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
          onFileClick={handleFileClick}
          activeRelPath={activeRelPath}
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
  readonly onFileClick: (relPath: string, name: string) => void;
  readonly activeRelPath: string | null;
}

function TreeChildren({
  entries,
  parentPath,
  depth,
  expanded,
  childrenByPath,
  onToggleDir,
  onFileClick,
  activeRelPath,
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
            onFileClick={onFileClick}
            activeRelPath={activeRelPath}
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
  readonly onFileClick: (relPath: string, name: string) => void;
  readonly activeRelPath: string | null;
}

function TreeRow({
  entry,
  path,
  depth,
  expanded,
  childrenByPath,
  onToggleDir,
  onFileClick,
  activeRelPath,
}: TreeRowProps) {
  const isDir: boolean = entry.kind === "dir";
  const isOpen: boolean = isDir && expanded.has(path);
  const childState: ChildrenState | undefined = isDir ? childrenByPath.get(path) : undefined;
  const isSelected: boolean = !isDir && activeRelPath === path;
  const iconClass: string = cn(
    "shrink-0",
    isDir ? "text-primary/80" : isSelected ? "text-primary" : "text-muted-foreground",
  );

  return (
    <li>
      <button
        type="button"
        onClick={() => {
          if (isDir) {
            onToggleDir(path);
          } else {
            onFileClick(path, entry.name);
          }
        }}
        className={cn(
          "hover:bg-popover/60 flex h-7 w-full items-center gap-1 rounded px-1 text-left text-xs transition-colors",
          isSelected && "bg-primary/20 hover:bg-primary/25",
        )}
        style={{ paddingLeft: indentPx(depth) }}
      >
        {isDir ? (
          isOpen ? (
            <I.chev_down className="text-muted-foreground shrink-0" />
          ) : (
            <I.chev className="text-muted-foreground shrink-0" />
          )
        ) : (
          <span className="inline-block w-[10px] shrink-0" aria-hidden />
        )}
        {isDir ? <I.folder className={iconClass} /> : <I.doc className={iconClass} />}
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
              onFileClick={onFileClick}
              activeRelPath={activeRelPath}
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
