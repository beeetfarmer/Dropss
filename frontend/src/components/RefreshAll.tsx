import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Disc3, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Summary } from "@/components/CheckProgressDialog";
import { useCancelRefresh, useRefetchReleases, useRefreshStatus, useStartRefresh } from "@/hooks/use-api";
import { cn } from "@/lib/utils";
import type { ApiRefreshStatus } from "@/types/music";

const RefreshAllContext = createContext({ start: () => {}, isRunning: false });

export const useRefreshAll = () => useContext(RefreshAllContext);

const plural = (count: number, noun: string) => `${count} ${noun}${count !== 1 ? "s" : ""}`;

const INTERRUPTED = "The server restarted before the refresh finished. Releases found so far are saved.";

const notifyFinished = ({ new_releases, failed, cancelled, checked, total, finished }: ApiRefreshStatus) => {
  const found = `${plural(new_releases, "new release")} found`;
  if (!finished) toast.warning(INTERRUPTED);
  else if (cancelled) toast.info(`Refresh cancelled after ${checked} of ${plural(total, "artist")}. ${found}`);
  else if (failed) toast.warning(`${found}, but some artists could not be checked`);
  else toast.success(found);
};

// Lives above the routes so a refresh sent to the background keeps being
// tracked, and stays reachable, on every page.
export const RefreshAllProvider = ({ enabled, children }: { enabled: boolean; children: ReactNode }) => {
  const { data: status } = useRefreshStatus(enabled);
  const startRefresh = useStartRefresh();
  const cancelRefresh = useCancelRefresh();
  const refetchReleases = useRefetchReleases();
  const [open, setOpen] = useState(false);
  const tracking = useRef(false);
  const shownNew = useRef(0);

  const isRunning = (status?.running ?? false) || startRefresh.isPending;

  useEffect(() => {
    if (!status) return;
    if (status.running) {
      tracking.current = true;
      if (status.new_releases > shownNew.current) {
        shownNew.current = status.new_releases;
        refetchReleases();
      }
      return;
    }
    if (!tracking.current || startRefresh.isPending) return;
    tracking.current = false;
    shownNew.current = 0;
    refetchReleases();
    if (!open) notifyFinished(status);
    // Only a status change may finish a run; closing the box must not re-trigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, startRefresh.isPending]);

  const start = () => {
    setOpen(true);
    if (isRunning) return;
    tracking.current = true;
    startRefresh.mutate(undefined, {
      onError: (e) => {
        tracking.current = false;
        setOpen(false);
        toast.error(`Refresh failed: ${e.message}`);
      },
    });
  };

  const cancel = () => {
    cancelRefresh.mutate(undefined, {
      onError: (e) => toast.error(`Could not cancel: ${e.message}`),
    });
  };

  return (
    <RefreshAllContext.Provider value={{ start, isRunning }}>
      {children}
      <RefreshAllDialog
        open={open}
        onOpenChange={setOpen}
        status={status}
        isRunning={isRunning}
        onCancel={cancel}
      />
      {isRunning && !open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Show refresh progress"
          className="fixed right-4 bottom-40 z-40 inline-flex h-9 items-center gap-2 rounded-full border border-white/[0.08] bg-[#111114]/95 px-4 text-xs font-medium shadow-2xl shadow-black/60 transition-all hover:border-white/[0.16] active:scale-[0.97] sm:bottom-24"
        >
          <Loader2 className="size-3.5 animate-spin text-primary" />
          Refreshing
          {status?.total ? <span className="font-mono text-muted-foreground">{status.checked}/{status.total}</span> : null}
        </button>
      )}
    </RefreshAllContext.Provider>
  );
};

interface RefreshAllDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status?: ApiRefreshStatus;
  isRunning: boolean;
  onCancel: () => void;
}

const RefreshAllDialog = ({ open, onOpenChange, status, isRunning, onCancel }: RefreshAllDialogProps) => {
  const total = status?.total ?? 0;
  const checked = status?.checked ?? 0;
  const newReleases = status?.new_releases ?? 0;
  const failed = status?.failed ?? 0;
  const cancelling = status?.cancelling ?? false;
  const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
  const current = isRunning ? status?.current : null;
  const interrupted = !isRunning && !status?.finished;

  const title = isRunning
    ? "Refreshing releases"
    : interrupted
      ? "Refresh interrupted"
      : status?.cancelled
        ? "Refresh cancelled"
        : "Refresh complete";
  const description = interrupted
    ? INTERRUPTED
    : isRunning && !total
      ? "Starting…"
      : !isRunning && !total
        ? "No artists to check"
        : `Checked ${checked} of ${plural(total, "artist")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-md [&>button:last-child]:hidden">
        {isRunning && <BorderBeam size={120} duration={4} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0)" />}
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="font-serif text-3xl font-normal tracking-tight">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className={cn("flex items-center gap-3", interrupted && "hidden")}>
            <Progress value={pct} aria-label="Refresh progress" className="h-2 bg-primary/10" />
            <span className="w-10 text-right font-mono text-xs text-muted-foreground">{pct}%</span>
          </div>

          <div className={cn("h-[58px]", interrupted && "hidden")}>
            <AnimatePresence mode="wait">
              {isRunning ? (
                <motion.div
                  key={current ?? "starting"}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                >
                  <p className="text-[10px] tracking-widest text-muted-foreground uppercase">
                    {cancelling ? "Stopping after" : "Current artist"}
                  </p>
                  <p className="truncate text-sm" title={current ?? undefined}>{current ?? "…"}</p>
                </motion.div>
              ) : (
                <motion.div key="summary" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="grid grid-cols-3 gap-2 text-center">
                  <Summary icon={<Disc3 className="size-4 text-primary" />} value={newReleases} label={`new release${newReleases !== 1 ? "s" : ""}`} />
                  <Summary icon={<CheckCircle2 className="size-4 text-status-available" />} value={checked} label="checked" />
                  <Summary icon={<XCircle className="size-4 text-destructive" />} value={failed} label="not checked" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fixed height so the buttons don't move when the first release turns up. */}
          {isRunning && (
            <p className="h-4 text-center text-xs text-muted-foreground">
              {newReleases > 0 && `${plural(newReleases, "new release")} so far`}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          {isRunning ? (
            <>
              <Button variant="outline" className="flex-1 rounded-full hover:border-destructive/40 hover:text-destructive" disabled={cancelling} onClick={onCancel}>
                {cancelling ? "Cancelling…" : "Cancel"}
              </Button>
              <Button className="flex-1 rounded-full" onClick={() => onOpenChange(false)}>Run in background</Button>
            </>
          ) : (
            <Button className="w-full rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
