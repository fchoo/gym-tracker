import { useCallback, useEffect, useRef, useState } from "react";

export type CsvExportControllerState<Handle> =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "preparing" }>
  | Readonly<{ kind: "ready_to_share"; handle: Handle }>
  | Readonly<{ kind: "sharing" }>
  | Readonly<{ kind: "create_failed" }>
  | Readonly<{ kind: "share_failed" }>;

/** Owns the prepared CSV handle lifecycle; callers only render the projected state. */
export function useCsvExportController<Handle>(input: Readonly<{
  create(): Promise<Handle>;
  share(handle: Handle): Promise<void>;
  discard(handle: Handle): Promise<void>;
}>) {
  const [state, setState] = useState<CsvExportControllerState<Handle>>({ kind: "ready" });
  const mounted = useRef(true);
  const latch = useRef(false);
  const generation = useRef(0);
  const handle = useRef<Handle | null>(null);
  const inputRef = useRef(input);
  inputRef.current = input;

  const create = useCallback(async () => {
    if (latch.current) return;
    latch.current = true;
    const currentGeneration = ++generation.current;
    setState({ kind: "preparing" });
    try {
      const next = await inputRef.current.create();
      if (!mounted.current || currentGeneration !== generation.current) {
        await inputRef.current.discard(next).catch(() => undefined);
        return;
      }
      const prior = handle.current;
      handle.current = next;
      if (prior !== null) await inputRef.current.discard(prior).catch(() => undefined);
      setState({ kind: "ready_to_share", handle: next });
    } catch {
      if (mounted.current && currentGeneration === generation.current) setState({ kind: "create_failed" });
    } finally {
      if (currentGeneration === generation.current) latch.current = false;
    }
  }, []);

  const share = useCallback(async () => {
    if (latch.current || handle.current === null) return;
    latch.current = true;
    const currentGeneration = ++generation.current;
    const currentHandle = handle.current;
    handle.current = null;
    setState({ kind: "sharing" });
    try {
      await inputRef.current.share(currentHandle);
      if (mounted.current && currentGeneration === generation.current) setState({ kind: "ready" });
    } catch {
      await inputRef.current.discard(currentHandle).catch(() => undefined);
      if (mounted.current && currentGeneration === generation.current) setState({ kind: "share_failed" });
    } finally {
      if (currentGeneration === generation.current) latch.current = false;
    }
  }, []);

  const retry = useCallback(() => {
    if (!latch.current) setState({ kind: "ready" });
  }, []);

  useEffect(() => () => {
    mounted.current = false;
    generation.current += 1;
    latch.current = false;
    const pending = handle.current;
    handle.current = null;
    if (pending !== null) void inputRef.current.discard(pending).catch(() => undefined);
  }, []);

  return { state, create, share, retry } as const;
}
