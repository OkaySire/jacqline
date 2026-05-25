import { useState } from "react";

import { I } from "@/components/icons";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui";
import type { Project } from "@/types/project";
import type { SessionMeta } from "@/types/session";

interface StatusbarProps {
  readonly project: Project;
  readonly session: SessionMeta | null;
}

/**
 * Bottom statusbar — branch / cwd / model / session info on the left, a
 * Cloud-sync toggle and small icon buttons (refresh / copy / inspector) on
 * the right. The cloud toggle is local-only for V2 — the backend hook (push
 * to `jacqcloud-buses`) lands in V0.2 per the orchestrator backlog.
 */
export function Statusbar({ project, session }: StatusbarProps) {
  const [cloudSync, setCloudSync] = useState<boolean>(true);
  const inspectorHidden: boolean = useUiStore((s) => s.inspectorHidden);
  const toggleInspector = useUiStore((s) => s.toggleInspector);

  // `branch` and `model` aren't on the Project shape yet (added in a later
  // schema bump). Use placeholders so the statusbar renders cleanly.
  const branchLabel: string = "—";
  const modelLabel: string = "claude-sonnet-4-5";
  const sessionLabel: string = session === null ? "no session" : sessionId(session);

  return (
    <div className="jq-statusbar">
      <span className="jq-seg">
        <I.branch />
        <span>{branchLabel}</span>
      </span>
      <span className="jq-seg">
        <span className="dim">cwd</span>
        <span className="jq-seg-truncate">{project.cwd}</span>
      </span>
      <span className="jq-seg">
        <span className="dim">model</span>
        <span>{modelLabel}</span>
      </span>
      <span className="jq-seg">
        <span className="dim">session</span>
        <span>{sessionLabel}</span>
      </span>
      <span className="jq-spacer" />
      <button
        type="button"
        className={cn("jq-sb-cloud", cloudSync ? "on" : "off")}
        onClick={() => setCloudSync((v: boolean) => !v)}
        title={
          cloudSync
            ? "Sauvegarde cloud activée — clic pour désactiver"
            : "Sauvegarde locale uniquement — clic pour activer"
        }
      >
        {cloudSync ? <I.cloud /> : <I.cloud_off />}
        <span className="jq-sb-cloud-label">Cloud</span>
        <span className="jq-sb-cloud-state">{cloudSync ? "sync" : "off"}</span>
      </button>
      <span className="jq-sb-actions">
        <button type="button" className="jq-iconbtn-sm" title="Recharger" disabled>
          <I.refresh />
        </button>
        <button type="button" className="jq-iconbtn-sm" title="Copier la sortie" disabled>
          <I.copy />
        </button>
        <button
          type="button"
          className={cn("jq-iconbtn-sm", !inspectorHidden && "active")}
          title={inspectorHidden ? "Show inspector" : "Hide inspector"}
          onClick={toggleInspector}
        >
          <I.panel_right />
        </button>
      </span>
    </div>
  );
}

function sessionId(session: SessionMeta): string {
  if (session.claudeId !== "") {
    return session.claudeId.replace(/^sess_/, "");
  }
  return session.name;
}
