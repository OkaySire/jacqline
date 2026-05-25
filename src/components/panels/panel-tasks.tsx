import { I } from "@/components/icons";

/**
 * Task list panel — V0.2 wires a real list of "tasks" the agent has
 * committed to within the session (the structured todo Claude maintains via
 * TaskCreate / TaskUpdate). Phase G ships the placeholder.
 */
export function PanelTasks() {
  return (
    <div className="text-fg-3 flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <I.activity style={{ width: 32, height: 32 }} className="text-fg-3/70" />
      <p className="text-fg-1 text-sm">Tasks panel</p>
      <p className="text-fg-3 max-w-xs text-xs">
        Streams the agent's structured task list. Wires up in V0.2 against the session's `TaskList`
        events.
      </p>
    </div>
  );
}
