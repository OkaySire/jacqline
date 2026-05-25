import { useState } from "react";

import { I } from "@/components/icons";
import { JacqlineMark } from "@/components/jacqline-mark";
import { cn } from "@/lib/utils";
import { useProjectsStore } from "@/stores/projects";
import { useUiStore } from "@/stores/ui";
import type { Project } from "@/types/project";

type SectionKey = "general" | "launch" | "environment" | "skills" | "mcp" | "preview";

interface SectionDef {
  readonly key: SectionKey;
  readonly label: string;
  readonly description: string;
  readonly icon: keyof typeof I;
}

const SECTIONS: readonly SectionDef[] = [
  {
    key: "general",
    label: "Général",
    description: "Project name, color, and metadata.",
    icon: "cog",
  },
  {
    key: "launch",
    label: "Lancement",
    description: "Command Jacqline runs to spawn a session in this project.",
    icon: "terminal",
  },
  {
    key: "environment",
    label: "Environnement",
    description: "Environment variables set for spawned sessions.",
    icon: "plug",
  },
  {
    key: "skills",
    label: "Skills",
    description: "Project-scoped agent recipes (opens the global Customize).",
    icon: "sparkle",
  },
  { key: "mcp", label: "MCP servers", description: "Project-scoped MCP servers.", icon: "plug" },
  {
    key: "preview",
    label: "Preview web",
    description: "URL of the web preview to render in the Inspector.",
    icon: "globe",
  },
];

/**
 * Per-project configuration window. Same shell as CustomizeWindow but scoped
 * to a single project (opened from the sidebar kebab → "Configurer le
 * projet…"). Phase F lands the shell + section headers; the rich content
 * lands in V0.2+ together with the schema bumps needed to persist
 * env/preview/skills.
 */
export function ProjectConfigWindow() {
  const projectId: string | null = useUiStore((s) => s.projectConfigFor);
  const close = useUiStore((s) => s.closeProjectConfig);
  const projects: readonly Project[] = useProjectsStore((s) => s.projects);
  const project: Project | undefined =
    projectId === null ? undefined : projects.find((p: Project) => p.id === projectId);

  if (projectId === null || project === undefined) {
    return null;
  }
  return (
    <div className="jq-cust-scrim" role="dialog" aria-modal="true" aria-labelledby="pc-title">
      <button
        type="button"
        className="jq-cust-scrim-backdrop"
        onClick={close}
        aria-label="Close project configuration"
      />
      <div className="jq-cust-window">
        <ProjectConfigShell project={project} onClose={close} />
      </div>
    </div>
  );
}

function ProjectConfigShell({
  project,
  onClose,
}: {
  readonly project: Project;
  readonly onClose: () => void;
}) {
  const [section, setSection] = useState<SectionKey>("general");
  const current: SectionDef = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0]!;

  return (
    <>
      <header className="jq-cust-titlebar">
        <div className="jq-cust-tb-left">
          <JacqlineMark size={14} />
          <span id="pc-title" className="jq-cust-tb-title">
            Configurer le projet
          </span>
          <span className="jq-cust-tb-sub">{project.name}</span>
        </div>
        <button
          type="button"
          className="jq-cust-tb-close"
          onClick={onClose}
          aria-label="Close project configuration"
          title="Close"
        >
          <I.close />
        </button>
      </header>
      <div className="jq-cust-body">
        <nav className="jq-cust-nav" aria-label="Project sections">
          <p className="jq-cust-nav-heading">Projet</p>
          {SECTIONS.map((s: SectionDef) => {
            const Icon = I[s.icon];
            return (
              <button
                key={s.key}
                type="button"
                className={cn("jq-cust-nav-item", section === s.key && "active")}
                onClick={() => setSection(s.key)}
              >
                {Icon !== undefined && <Icon />}
                <span>{s.label}</span>
              </button>
            );
          })}
        </nav>
        <main className="jq-cust-content" key={current.key}>
          <header className="jq-cust-content-header">
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </header>
          {section === "general" && (
            <div className="jq-pc-grid">
              <ReadonlyField label="Name" value={project.name} />
              <ReadonlyField label="Working directory" value={project.cwd} mono />
              <ReadonlyField label="Shell" value={`${project.shellKind}:${project.shellValue}`} />
              <ReadonlyField label="Provider" value={project.provider} />
            </div>
          )}
          {section !== "general" && (
            <div className="jq-cust-empty">
              <p>Section content lands in V0.2.</p>
            </div>
          )}
        </main>
      </div>
    </>
  );
}

function ReadonlyField({
  label,
  value,
  mono = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly mono?: boolean;
}) {
  return (
    <div className="jq-pc-field">
      <label className="jq-pc-field-label">{label}</label>
      <div className={cn("jq-pc-field-value", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}
