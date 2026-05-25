import { useState } from "react";

import { I } from "@/components/icons";
import { JacqlineMark } from "@/components/jacqline-mark";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";

type SectionKey = "skills" | "mcp" | "plugins" | "channels" | "appearance" | "shortcuts";

interface SectionDef {
  readonly key: SectionKey;
  readonly label: string;
  readonly description: string;
  readonly icon: keyof typeof I;
}

const SECTIONS: readonly SectionDef[] = [
  {
    key: "skills",
    label: "Skills",
    description: "Custom agent recipes shared across all projects.",
    icon: "sparkle",
  },
  {
    key: "mcp",
    label: "MCP servers",
    description: "Model Context Protocol servers Claude can call.",
    icon: "plug",
  },
  {
    key: "plugins",
    label: "Plugins",
    description: "Extensions that ship UI panels or commands.",
    icon: "command",
  },
  {
    key: "channels",
    label: "Channels",
    description: "JacqCloud bus channels the app subscribes to.",
    icon: "globe",
  },
  {
    key: "appearance",
    label: "Apparence",
    description: "Theme and font preferences.",
    icon: "cog",
  },
  {
    key: "shortcuts",
    label: "Raccourcis",
    description: "Keyboard shortcuts Jacqline registers.",
    icon: "command",
  },
];

/**
 * Global Customize window — 1100×740 modal with a 240 px sidebar nav and a
 * content area. Phase F lands the shell + section headers; the rich content
 * (Skills card grid, MCP server list, etc.) is intentionally placeholder
 * pending the dedicated backend stores (V0.2+).
 */
export function CustomizeWindow() {
  const open: boolean = useUiStore((s) => s.customizeOpen);
  const close = useUiStore((s) => s.closeCustomize);

  if (!open) {
    return null;
  }
  return (
    <div className="jq-cust-scrim" role="dialog" aria-modal="true" aria-labelledby="cust-title">
      <button
        type="button"
        className="jq-cust-scrim-backdrop"
        onClick={close}
        aria-label="Close customize"
      />
      <div className="jq-cust-window">
        <CustomizeShell onClose={close} />
      </div>
    </div>
  );
}

function CustomizeShell({ onClose }: { readonly onClose: () => void }) {
  const [section, setSection] = useState<SectionKey>("skills");
  const current: SectionDef = SECTIONS.find((s) => s.key === section) ?? SECTIONS[0]!;

  return (
    <>
      <header className="jq-cust-titlebar">
        <div className="jq-cust-tb-left">
          <JacqlineMark size={14} />
          <span id="cust-title" className="jq-cust-tb-title">
            Customize
          </span>
          <span className="jq-cust-tb-sub">global · all projects</span>
        </div>
        <button
          type="button"
          className="jq-cust-tb-close"
          onClick={onClose}
          aria-label="Close customize"
          title="Close"
        >
          <I.close />
        </button>
      </header>
      <div className="jq-cust-body">
        <nav className="jq-cust-nav" aria-label="Customize sections">
          <p className="jq-cust-nav-heading">Réglages</p>
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
          <div className="jq-cust-nav-spacer" />
          <p className="jq-cust-nav-heading">Aide</p>
          <button type="button" className="jq-cust-nav-item" disabled>
            <I.doc />
            <span>Documentation</span>
          </button>
          <button type="button" className="jq-cust-nav-item" disabled>
            <I.globe />
            <span>Communauté</span>
          </button>
        </nav>
        <main className="jq-cust-content" key={current.key}>
          <header className="jq-cust-content-header">
            <h1>{current.label}</h1>
            <p>{current.description}</p>
          </header>
          <div className="jq-cust-empty">
            <p>Section content lands in V0.2.</p>
          </div>
        </main>
      </div>
    </>
  );
}
