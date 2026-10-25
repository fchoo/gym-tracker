import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { createExactRestAlarmAccessPort, type ExactRestAlarmAccess, type ExactRestAlarmAccessPort } from "../platform/notifications/exactAlarmAccess";

export function useExactRestAlarmAccess(injected?: ExactRestAlarmAccessPort) {
  const port = useMemo(() => injected ?? createExactRestAlarmAccessPort(), [injected]);
  const [access, setAccess] = useState<ExactRestAlarmAccess>(() => port.read());
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const previousAccess = useRef(access);
  const mounted = useRef(true);
  const refreshPending = useCallback(async () => {
    try { await port.refreshPendingAlarms(); if (mounted.current) setRefreshFailed(false); }
    catch { if (mounted.current) setRefreshFailed(true); }
  }, [port]);
  useEffect(() => {
    mounted.current = true;
    setAccess(port.read());
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const next = port.read();
      if (previousAccess.current === "denied" && next === "allowed") void refreshPending();
      previousAccess.current = next;
      setAccess(next);
    });
    return () => { mounted.current = false; listener.remove(); };
  }, [port, refreshPending]);
  const openSettings = useCallback(async () => {
    if (opening) return;
    setOpening(true);
    setOpenFailed(false);
    try {
      const opened = await port.openSettings();
      if (mounted.current) setOpenFailed(!opened);
    } catch {
      if (mounted.current) setOpenFailed(true);
    } finally {
      if (mounted.current) { setOpening(false); setAccess(port.read()); }
    }
  }, [opening, port]);
  return { access, opening, openFailed, refreshFailed, openSettings, retryRefresh: refreshPending };
}
