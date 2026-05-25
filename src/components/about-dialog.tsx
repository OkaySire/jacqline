import { JacqlineMark } from "@/components/jacqline-mark";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUiStore } from "@/stores/ui";

// Bumped manually with each release; mirrored in src-tauri/Cargo.toml +
// src-tauri/tauri.conf.json + package.json. Bundling APP_VERSION via Vite is
// possible but adds a build-time dependency we don't need for the MVP.
const APP_VERSION: string = "0.1.0";
const REPO_URL: string = "https://github.com/OkaySire/jacqline";

export function AboutDialog() {
  const open = useUiStore((s) => s.aboutDialogOpen);
  const close = useUiStore((s) => s.closeAbout);

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="sr-only">About Jacqline</DialogTitle>
          <DialogDescription className="sr-only">
            Version, license, and source code links.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <JacqlineMark size={56} />
          <div>
            <p className="text-lg font-semibold tracking-tight">Jacqline</p>
            <p className="text-muted-foreground font-mono text-xs">v{APP_VERSION}</p>
          </div>
          <p className="text-muted-foreground max-w-xs text-sm">
            Cross-platform desktop app to drive Claude sessions, with native JacqCloud bus
            integration.
          </p>
          <p className="text-muted-foreground text-xs">
            Licensed under{" "}
            <a
              href="https://www.apache.org/licenses/LICENSE-2.0"
              target="_blank"
              rel="noreferrer"
              className="text-primary underline-offset-2 hover:underline"
            >
              Apache 2.0
            </a>
            .
          </p>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              window.open(REPO_URL, "_blank", "noopener,noreferrer");
            }}
          >
            View on GitHub
          </Button>
          <Button type="button" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
