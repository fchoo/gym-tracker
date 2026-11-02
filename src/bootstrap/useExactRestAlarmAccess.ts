import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { createExactRestAlarmAccessPort, type ExactRestAlarmAccess, type ExactRestAlarmAccessPort } from "../platform/notifications/exactAlarmAccess";

export function useExactRestAlarmAccess(injected?: ExactRestAlarmAccessPort, refreshCurrentRestAlarms?: () => Promise<void>) {
  const port = useMemo(() => injected ?? createExactRestAlarmAccessPort(), [injected]);
  const [access, setAccess] = useState<ExactRestAlarmAccess>(() => port.read());
  const [opening, setOpening] = useState(false);
  const [openFailed, setOpenFailed] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const previousAccess = useRef(access);
  const mounted = useRef(true);
  const refreshCallback = useRef(refreshCurrentRestAlarms);
  refreshCallback.current = refreshCurrentRestAlarms;
  const refreshPending = useCallback(async () => {
    if (refreshCallback.current === undefined) return;
    // The runtime reads current rest facts in its serialized reconciliation
    // queue. This controller never replays captured native notifications.
    try { await refreshCallback.current(); if (mounted.current) setRefreshFailed(false); }
    catch { if (mounted.current) setRefreshFailed(true); }
  }, []);
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
