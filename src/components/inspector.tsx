import { useState } from "react";

import { I } from "@/components/icons";
import { PanelBrowser } from "@/components/panels/panel-browser";
import { PanelDebug } from "@/components/panels/panel-debug";
import { PanelDiff } from "@/components/panels/panel-diff";
import { PanelFile } from "@/components/panels/panel-file";
import { PanelTasks } from "@/components/panels/panel-tasks";
import { cn } from "@/lib/utils";
import { useActiveProject } from "@/stores/projects";

type PanelType = "file" | "browser" | "tasks" | "diff" | "debug";

interface InspectorTab {
  readonly id: string;
  readonly type: PanelType;
  readonly title: string;
  readonly icon: keyof typeof I;
  readonly filePath?: string;
}

interface PanelChoice {
  readonly key: string;
  readonly type: PanelType;
  readonly title: string;
  readonly icon: keyof typeof I;
  readonly description: string;
  readonly filePath?: string;
}

const PANEL_CHOICES: readonly PanelChoice[] = [
  {
    key: "claude-md",
    type: "file",
    title: "CLAUDE.md",
    icon: "doc",
    description: "Project AI guide",
    filePath: "CLAUDE.md",
  },
  {
    key: "agents-md",
    type: "file",
    title: "AGENTS.md",
    icon: "sparkle",
    description: "Agent recipes",
    filePath: "AGENTS.md",
  },
  {
    key: "readme",
    type: "file",
    title: "README.md",
    icon: "doc",
    description: "Project readme",
    filePath: "README.md",
  },
  {
    key: "contributing",
    type: "file",
    title: "CONTRIBUTING.md",
    icon: "doc",
    description: "Contributing guide",
    filePath: "CONTRIBUTING.md",
  },
  { key: "browser", type: "browser", title: "Browser", icon: "globe", description: "Web preview" },
  { key: "tasks", type: "tasks", title: "Tasks", icon: "activity", description: "Agent task list" },
  { key: "diff", type: "diff", title: "Diff", icon: "branch", description: "git diff vs HEAD" },
  {
    key: "debug",
    type: "debug",
    title: "Debug",
    icon: "bug",
    description: "Snapshot for bug reports",
  },
];

/**
 * Right-hand inspector. Dynamic multi-tab system: every tab has a type
 * (`file` / `browser` / `tasks` / `diff`) and can be closed; the `+` button
 * opens a local PanelChooser to add a new tab.
 *
 * The Inspector itself is **not** scoped to a single project — tabs hold
 * their own project id so the user could in theory show a panel from project
 * A while project B is active. In practice the chooser only suggests panels
 * for the active project.
 */
export function Inspector() {
  const project = useActiveProject();
  const [tabs, setTabs] = useState<readonly InspectorTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [chooserOpen, setChooserOpen] = useState<boolean>(false);

  const activeTab: InspectorTab | undefined = tabs.find((t: InspectorTab) => t.id === activeTabId);

  function addTab(choice: PanelChoice): void {
    const id: string = `${choice.key}-${Date.now().toString(36)}`;
    const tab: InspectorTab = {
      id,
      type: choice.type,
      title: choice.title,
      icon: choice.icon,
      ...(choice.filePath !== undefined ? { filePath: choice.filePath } : {}),
    };
    setTabs((prev: readonly InspectorTab[]) => [...prev, tab]);
    setActiveTabId(id);
    setChooserOpen(false);
  }

  function closeTab(id: string): void {
    setTabs((prev: readonly InspectorTab[]) => {
      const next: InspectorTab[] = prev.filter((t: InspectorTab) => t.id !== id);
      if (id === activeTabId) {
        setActiveTabId(next.length > 0 ? (next[next.length - 1]?.id ?? null) : null);
      }
      return next;
    });
  }

  return (
    <aside className="jq-inspector">
      <div className="jq-insp-tabs">
        {tabs.map((tab: InspectorTab) => {
          const Icon = I[tab.icon];
          const isActive: boolean = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              className={cn("jq-insp-tab", isActive && "active")}
              onClick={() => setActiveTabId(tab.id)}
            >
              {Icon !== undefined && <Icon className="jq-insp-tab-icon" />}
              <span className="jq-insp-tab-label">{tab.title}</span>
              <button
                type="button"
                className="jq-insp-tab-close"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                aria-label={`Close ${tab.title}`}
                title="Close tab"
              >
                <I.close />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className={cn("jq-insp-add", chooserOpen && "active")}
          onClick={() => setChooserOpen((v: boolean) => !v)}
          aria-label="Add panel"
          title="Add panel"
        >
          <I.plus />
        </button>
      </div>
      <div className="jq-insp-body">
        {activeTab === undefined && !chooserOpen && (
          <div className="jq-insp-empty">
            <I.doc style={{ width: 28, height: 28 }} className="text-fg-3/60" />
            <p className="text-fg-1 mt-3 text-sm font-medium">Aucun panneau ouvert</p>
            <p className="text-fg-3 mt-1 max-w-xs text-xs">
              Cliquez sur <I.plus className="mx-1 inline-block align-middle" /> pour ajouter un
              panneau (CLAUDE.md, Browser, Tasks, Diff…).
            </p>
          </div>
        )}
        {activeTab !== undefined && project !== null && (
          <PanelBody tab={activeTab} projectId={project.id} />
        )}
        {activeTab !== undefined && project === null && (
          <p className="text-fg-3 p-4 text-xs">Select a project to render this panel.</p>
        )}

        {chooserOpen && (
          <PanelChooser
            onPick={(choice: PanelChoice) => {
              addTab(choice);
            }}
            onClose={() => setChooserOpen(false)}
          />
        )}
      </div>
    </aside>
  );
}

function PanelBody({ tab, projectId }: { readonly tab: InspectorTab; readonly projectId: string }) {
  if (tab.type === "file") {
    return <PanelFile projectId={projectId} relPath={tab.filePath ?? ""} />;
  }
  if (tab.type === "browser") {
    return <PanelBrowser />;
  }
  if (tab.type === "tasks") {
    return <PanelTasks />;
  }
  if (tab.type === "debug") {
    return <PanelDebug />;
  }
  return <PanelDiff projectId={projectId} />;
}

function PanelChooser({
  onPick,
  onClose,
}: {
  readonly onPick: (choice: PanelChoice) => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="jq-insp-add-menu" role="dialog" aria-label="Add panel">
      <div className="jq-insp-add-header">
        <p className="text-fg-0 text-sm font-medium">Add panel</p>
        <button
          type="button"
          className="text-fg-3 hover:text-fg-0"
          onClick={onClose}
          aria-label="Close chooser"
        >
          <I.close />
        </button>
      </div>
      <div className="jq-insp-add-grid">
        {PANEL_CHOICES.map((choice: PanelChoice) => {
          const Icon = I[choice.icon];
          return (
            <button
              key={choice.key}
              type="button"
              className="jq-insp-add-tile"
              onClick={() => onPick(choice)}
            >
              {Icon !== undefined && <Icon className="text-fg-1" />}
              <span className="jq-insp-add-tile-title">{choice.title}</span>
              <span className="jq-insp-add-tile-desc">{choice.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
