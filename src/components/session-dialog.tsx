import { useState, type FormEvent } from "react";

import { I } from "@/components/icons";
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
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/stores/projects";
import { useSessionsStore } from "@/stores/sessions";
import { useUiStore } from "@/stores/ui";
import type { Project } from "@/types/project";
import type { SessionMeta } from "@/types/session";

interface AgentDef {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly icon: keyof typeof I;
}

/**
 * Hardcoded agent picker — matches the mockup. The actual "agent" routing
 * (each option spawning Claude with a different system-prompt or wrapper
 * script) lands in V0.2 with the JacqCloud Skills runtime. For Phase F the
 * choice is visual only; submission spawns a vanilla session with the chosen
 * `name`.
 */
const AGENTS: readonly AgentDef[] = [
  {
    key: "default",
    label: "default",
    description: "Claude with its default prompt.",
    icon: "sparkle",
  },
  {
    key: "code-reviewer",
    label: "code-reviewer",
    description: "Adversarial diff reviewer.",
    icon: "check",
  },
  {
    key: "test-runner",
    label: "test-runner",
    description: "Drives the project's test suite.",
    icon: "activity",
  },
  {
    key: "doc-writer",
    label: "doc-writer",
    description: "Drafts docs from the code.",
    icon: "doc",
  },
  {
    key: "pr-reviewer",
    label: "pr-reviewer",
    description: "Reviews open pull requests.",
    icon: "branch",
  },
  {
    key: "release-notes",
    label: "release-notes",
    description: "Summarises commits between tags.",
    icon: "rename",
  },
];

export function SessionDialog() {
  const state = useUiStore((s) => s.sessionDialog);
  const close = useUiStore((s) => s.closeSessionDialog);
  const isOpen: boolean = state !== null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next: boolean) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        {state !== null && <SessionDialogForm state={state} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function SessionDialogForm({
  state,
  onClose,
}: {
  readonly state: { mode: "new" | "edit"; projectId: string; sessionId: string | null };
  readonly onClose: () => void;
}) {
  const projects: readonly Project[] = useProjectsStore((s) => s.projects);
  const project: Project | undefined = projects.find((p: Project) => p.id === state.projectId);
  const sessionsByProject = useSessionsStore((s) => s.sessionsByProject);
  const existingSession: SessionMeta | undefined =
    state.sessionId === null
      ? undefined
      : (sessionsByProject.get(state.projectId) ?? []).find(
          (s: SessionMeta) => s.id === state.sessionId,
        );

  const createSession = useSessionsStore((s) => s.createSession);

  const [name, setName] = useState<string>(existingSession?.name ?? "");
  const [agent, setAgent] = useState<string>("default");
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (project === undefined) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const trimmed: string = name.trim();
    if (trimmed === "") {
      setError("Session name is required.");
      return;
    }

    setSubmitting(true);
    try {
      if (state.mode === "new") {
        await createSession(state.projectId, trimmed);
      } else {
        // Edit mode wiring (name + agent → session_update_meta + persisted
        // agent column) lands in V0.2 — for now we just close.
        console.warn("Session edit not yet wired");
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const eyebrowLabel: string = state.mode === "new" ? "Nouvelle session" : "Modifier la session";

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        void handleSubmit(event);
      }}
    >
      <DialogHeader className="space-y-1">
        <p className="jq-ns-eyebrow">{eyebrowLabel}</p>
        <DialogTitle className="text-fg-0 text-lg font-semibold tracking-tight">
          {project.name}
        </DialogTitle>
        <DialogDescription>
          Pick an agent and a name. The session spawns inside the project's working directory.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-4">
        <div className="space-y-2">
          <Label htmlFor="session-name">Nom de la session</Label>
          <Input
            id="session-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="tests"
            autoFocus
            required
          />
        </div>
        <div className="space-y-2">
          <p className="text-fg-2 text-xs font-medium">Agent</p>
          <div className="grid grid-cols-2 gap-2">
            {AGENTS.map((option: AgentDef) => {
              const Icon = I[option.icon];
              const isSelected: boolean = agent === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setAgent(option.key)}
                  className={cn(
                    "jq-agent-tile flex items-start gap-2 rounded-lg border p-2 text-left transition-colors",
                    isSelected
                      ? "border-accent-line bg-accent-soft text-fg-0"
                      : "border-line-soft hover:bg-bg-3 text-fg-1",
                  )}
                >
                  {Icon !== undefined && (
                    <Icon className={cn(isSelected ? "text-accent-fg" : "text-fg-2", "mt-0.5")} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs">{option.label}</p>
                    <p className="text-fg-3 mt-0.5 text-[11px] leading-snug">
                      {option.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-fg-3 text-[10.5px]">
            Agent routing lands in V0.2. The choice is recorded but currently spawns a vanilla
            session.
          </p>
        </div>
        {error !== null && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "…" : state.mode === "new" ? "Créer la session" : "Enregistrer"}
        </Button>
      </DialogFooter>
    </form>
  );
}
