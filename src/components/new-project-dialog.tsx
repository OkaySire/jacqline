import { open as openDirectoryPicker } from "@tauri-apps/plugin-dialog";
import { Folder } from "lucide-react";
import { useState, type FormEvent } from "react";

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
import { useProjectsStore } from "@/stores/projects";
import type { ShellKind } from "@/types/project";

interface ShellOption {
  readonly label: string;
  readonly shellKind: ShellKind;
  readonly shellValue: string;
}

/**
 * Phase 2 hardcodes a few common shells. Phase 3 will replace this with a
 * runtime-detected list (Unix `/etc/shells`, Windows `pwsh.exe`/`cmd.exe`,
 * `wsl.exe --list --quiet`).
 */
const SHELL_OPTIONS: readonly ShellOption[] = [
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
  const create = useProjectsStore((s) => s.create);

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
    const shell: ShellOption | undefined = SHELL_OPTIONS[idx];
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
      <DialogContent>
        <form
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            void handleSubmit(event);
          }}
        >
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
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
              <Label htmlFor="project-shell">Shell</Label>
              <Select value={shellIndex} onValueChange={setShellIndex}>
                <SelectTrigger id="project-shell" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SHELL_OPTIONS.map((opt: ShellOption, idx: number) => (
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
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
