import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Release, ApiLibraryCheckResult } from "@/types/music";
import type { CheckProgressDialogProps } from "@/components/CheckProgressDialog";

interface UseLibraryCheckOptions {
  checkFn: (releaseId: number) => Promise<ApiLibraryCheckResult>;
  serviceName: string;
}

export function useLibraryCheck({ checkFn, serviceName }: UseLibraryCheckOptions) {
  const qc = useQueryClient();
  const [state, setState] = useState({
    open: false,
    current: 0,
    total: 0,
    currentReleaseName: "",
    inLibraryCount: 0,
    errorsCount: 0,
    isFinished: false,
  });
  const runningRef = useRef(false);

  const run = useCallback(
    async (releases: Release[]) => {
      if (runningRef.current) return;
      runningRef.current = true;

      setState({
        open: true,
        current: 0,
        total: releases.length,
        currentReleaseName: "",
        inLibraryCount: 0,
        errorsCount: 0,
        isFinished: false,
      });

      let inLib = 0;
      let errs = 0;

      for (let i = 0; i < releases.length; i++) {
        const release = releases[i];
        setState((s) => ({
          ...s,
          current: i,
          currentReleaseName: `${release.artistName} — ${release.name}`,
        }));

        try {
          const result = await checkFn(release.id);
          if (result?.in_library) inLib++;
        } catch {
          errs++;
        }

        setState((s) => ({
          ...s,
          current: i + 1,
          inLibraryCount: inLib,
          errorsCount: errs,
        }));
      }

      setState((s) => ({ ...s, isFinished: true }));
      runningRef.current = false;

      qc.invalidateQueries({ queryKey: ["releases", "latest"] });
      qc.invalidateQueries({ queryKey: ["releases", "all"] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "artists" && q.queryKey[2] === "releases" });
    },
    [checkFn, qc],
  );

  const setOpen = useCallback((open: boolean) => {
    if (!open) setState((s) => ({ ...s, open: false }));
  }, []);

  const dialogProps: CheckProgressDialogProps = {
    open: state.open,
    onOpenChange: setOpen,
    serviceName,
    current: state.current,
    total: state.total,
    currentReleaseName: state.currentReleaseName,
    inLibraryCount: state.inLibraryCount,
    errorsCount: state.errorsCount,
    isFinished: state.isFinished,
  };

  return { run, isRunning: runningRef.current, dialogProps };
}
