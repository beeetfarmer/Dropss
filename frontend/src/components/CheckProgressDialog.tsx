import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => { if (!isFinished) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isFinished ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            )}
            {isFinished ? `${serviceName} Check Complete` : `Checking ${serviceName}`}
          </DialogTitle>
          <DialogDescription>
            {isFinished
              ? `Checked ${total} release${total !== 1 ? "s" : ""}`
              : `Checking release ${current} of ${total}...`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Progress value={pct} className="h-3" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{pct}%</span>
            <span>{current} / {total}</span>
          </div>

          {!isFinished && currentReleaseName && (
            <div className="rounded-md border border-border/60 bg-secondary/40 px-2.5 py-2">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Current release</p>
              <p className="text-sm text-foreground break-words [overflow-wrap:anywhere]">{currentReleaseName}</p>
            </div>
          )}

          {isFinished && (
            <div className="flex flex-wrap gap-4 text-sm pt-1">
              <span className="flex items-center gap-1.5 text-green-500">
                <CheckCircle2 className="h-4 w-4" /> {inLibraryCount} in library
              </span>
              <span className="text-muted-foreground">{notFoundCount} not found</span>
              {errorsCount > 0 && (
                <span className="flex items-center gap-1.5 text-destructive">
                  <XCircle className="h-4 w-4" /> {errorsCount} error{errorsCount !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>

        {isFinished && (
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
