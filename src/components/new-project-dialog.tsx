import { open as openDirectoryPicker } from "@tauri-apps/plugin-dialog";
import { Folder } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { detectShells, type ShellOption } from "@/lib/api/shells";
import { useProjectsStore } from "@/stores/projects";

/**
 * If the Rust `detect_shells` command fails or returns nothing, we still want
 * the form to be usable. These mirror the Phase 2 hardcoded options so the user
 * never sees an empty dropdown.
 */
const FALLBACK_SHELLS: readonly ShellOption[] = [
  { label: "bash", shellKind: "native", shellValue: "bash" },
  { label: "zsh", shellKind: "native", shellValue: "zsh" },
  { label: "fish", shellKind: "native", shellValue: "fish" },
  { label: "PowerShell (pwsh)", shellKind: "native", shellValue: "pwsh" },
  { label: "cmd.exe", shellKind: "native", shellValue: "cmd" },
  { label: "WSL: Ubuntu", shellKind: "wsl", shellValue: "Ubuntu" },
  { label: "WSL: Debian", shellKind: "wsl", shellValue: "Debian" },
];

interface NewProjectDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function NewProjectDialog({ open: isOpen, onOpenChange }: NewProjectDialogProps) {
  const [name, setName] = useState<string>("");
  const [cwd, setCwd] = useState<string>("");
  const [shellIndex, setShellIndex] = useState<string>("0");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [shells, setShells] = useState<readonly ShellOption[]>(FALLBACK_SHELLS);
  const [shellsLoading, setShellsLoading] = useState<boolean>(false);
  const create = useProjectsStore((s) => s.create);

  // Fetch detected shells when the dialog opens. We refresh on every open in
  // case the user installed a new shell (or WSL distro) since the app started.
  // The fetch runs inside an async IIFE so the initial loading flag flip lands
  // in a microtask callback (avoids `react-hooks/set-state-in-effect`).
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled: boolean = false;
    void (async () => {
      setShellsLoading(true);
      try {
        const detected: ShellOption[] = await detectShells();
        if (cancelled) {
          return;
        }
        setShells(detected.length > 0 ? detected : FALLBACK_SHELLS);
        setShellIndex("0");
      } catch (err: unknown) {
        if (cancelled) {
          return;
        }
        // Detection failure is non-fatal — keep the fallback list so the form
        // remains usable, but log it so we can spot platform regressions.
        console.warn("detect_shells failed; keeping fallback list", err);
        setShells(FALLBACK_SHELLS);
        setShellIndex("0");
      } finally {
        if (!cancelled) {
          setShellsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  function reset(): void {
    setName("");
    setCwd("");
    setShellIndex("0");
    setError(null);
  }

  async function pickDirectory(): Promise<void> {
    try {
      const selected: string | string[] | null = await openDirectoryPicker({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string") {
        setCwd(selected);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const idx: number = Number.parseInt(shellIndex, 10);
    const shell: ShellOption | undefined = shells[idx];
    if (!shell) {
      setError("Please pick a shell.");
      return;
    }

    const trimmedName: string = name.trim();
    const trimmedCwd: string = cwd.trim();
    if (!trimmedName || !trimmedCwd) {
      setError("Name and working directory are required.");
      return;
    }

    setSubmitting(true);
    try {
      await create({
        name: trimmedName,
        cwd: trimmedCwd,
        shellKind: shell.shellKind,
        shellValue: shell.shellValue,
      });
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(next: boolean): void {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            void handleSubmit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle className="tracking-tight">New project</DialogTitle>
            <DialogDescription>
              Set the working directory and shell to spawn for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-project"
                autoFocus
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-cwd">Working directory</Label>
              <div className="flex gap-2">
                <Input
                  id="project-cwd"
                  value={cwd}
                  onChange={(e) => setCwd(e.target.value)}
                  placeholder="/path/to/project"
                  className="font-mono flex-1 text-xs"
                  required
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void pickDirectory()}
                  aria-label="Browse for directory"
                >
                  <Folder className="size-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-shell">
                Shell
                {shellsLoading && (
                  <span className="text-muted-foreground ml-2 text-xs">(detecting…)</span>
                )}
              </Label>
              <Select value={shellIndex} onValueChange={setShellIndex} disabled={shellsLoading}>
                <SelectTrigger id="project-shell" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {shells.map((opt: ShellOption, idx: number) => (
                    <SelectItem key={`${opt.shellKind}:${opt.shellValue}`} value={String(idx)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error !== null && <p className="text-destructive text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || shellsLoading}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
