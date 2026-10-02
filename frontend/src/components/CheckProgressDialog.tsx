import { AnimatePresence, motion } from "motion/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { AnimatedCircularProgressBar } from "@/components/ui/animated-circular-progress-bar";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, CircleDashed } from "lucide-react";

export interface CheckProgressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceName: string;
  current: number;
  total: number;
  currentReleaseName: string;
  inLibraryCount: number;
  errorsCount: number;
  isFinished: boolean;
}

export default function CheckProgressDialog({
  open,
  onOpenChange,
  serviceName,
  current,
  total,
  currentReleaseName,
  inLibraryCount,
  errorsCount,
  isFinished,
}: CheckProgressDialogProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  const notFoundCount = current - inLibraryCount - errorsCount;

  return (
    <Dialog open={open} onOpenChange={isFinished ? onOpenChange : undefined}>
      <DialogContent
        className="overflow-hidden sm:max-w-md [&>button:last-child]:hidden"
        onPointerDownOutside={(e) => { if (!isFinished) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!isFinished) e.preventDefault(); }}
      >
        {!isFinished && <BorderBeam size={120} duration={4} colorFrom="hsl(var(--primary))" colorTo="hsl(var(--primary) / 0)" />}
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="font-serif text-3xl font-normal tracking-tight">
            {isFinished ? `${serviceName} check complete` : `Checking ${serviceName}`}
          </DialogTitle>
          <DialogDescription>
            {isFinished
              ? `Checked ${total} release${total !== 1 ? "s" : ""}`
              : `Checking release ${current} of ${total}…`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5 py-2">
          <AnimatedCircularProgressBar
            value={pct}
            gaugePrimaryColor="hsl(var(--primary))"
            gaugeSecondaryColor="hsl(var(--primary) / 0.12)"
            className="size-36 font-mono text-3xl font-medium [&_span]:after:text-base [&_span]:after:text-muted-foreground [&_span]:after:content-['%']"
          />
          <p className="font-mono text-xs text-muted-foreground">{current} / {total}</p>

          <div className="h-[58px] w-full">
            <AnimatePresence mode="wait">
              {!isFinished && currentReleaseName ? (
                <motion.div
                  key={currentReleaseName}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2"
                >
                  <p className="text-[10px] tracking-widest text-muted-foreground uppercase">Current release</p>
                  <p className="truncate text-sm [overflow-wrap:anywhere]" title={currentReleaseName}>{currentReleaseName}</p>
                </motion.div>
              ) : isFinished ? (
                <motion.div
                  key="summary"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="grid grid-cols-3 gap-2 text-center"
                >
                  <Summary icon={<CheckCircle2 className="size-4 text-status-available" />} value={inLibraryCount} label="in library" />
                  <Summary icon={<CircleDashed className="size-4 text-muted-foreground" />} value={notFoundCount} label="not found" />
                  <Summary icon={<XCircle className="size-4 text-destructive" />} value={errorsCount} label={`error${errorsCount !== 1 ? "s" : ""}`} />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        </div>

        {isFinished && (
          <DialogFooter>
            <Button className="w-full rounded-full" onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Summary = ({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) => (
  <div className="flex flex-col items-center gap-1 rounded-xl bg-white/[0.03] py-2">
    {icon}
    <span className="font-mono text-lg leading-none">{value}</span>
    <span className="text-[10px] text-muted-foreground">{label}</span>
  </div>
);
