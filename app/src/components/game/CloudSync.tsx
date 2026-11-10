import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, RefreshCw } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { gameSnapshot, useGameStore } from "@/store/gameStore";
import { isLegacyDemoSave } from "@/lib/seed";

function deviceId() {
  const key = "life-rpg-device";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}

export function CloudSync({ authenticated }: { authenticated: boolean }) {
  const updatedAt = useGameStore((state) => state.updatedAt);
  const importState = useGameStore((state) => state.importState);
  const [status, setStatus] = useState<"idle" | "loading" | "saved" | "error">("idle");
  const [revision, setRevision] = useState<number | null>(null);
  const [initialized, setInitialized] = useState(false);
  const revisionRef = useRef<number | null>(null);
  const skipNext = useRef(false);
  const cloudQuery = trpc.save.get.useQuery(undefined, { enabled: authenticated, retry: false });
  const syncMutation = trpc.save.sync.useMutation({
    onSuccess: (result) => {
      if (result.status === "conflict") {
        if (result.state) {
          revisionRef.current = result.revision;
          setRevision(result.revision);
          if (result.state.updatedAt > useGameStore.getState().updatedAt) {
            skipNext.current = true;
            importState(result.state);
          }
        } else {
          // No server row remains; the next explicit sync may create revision 1.
          revisionRef.current = null;
          setRevision(null);
        }
        // A conflict is not a successful sync; require an explicit retry.
        setStatus("error");
        return;
      }
      revisionRef.current = result.revision;
      setRevision(result.revision);
      setStatus("saved");
    },
    onError: () => setStatus("error"),
  });
  const mutate = syncMutation.mutate;

  useEffect(() => {
    if (!authenticated || cloudQuery.isLoading || initialized) return;
    // A failed read is not equivalent to an empty cloud. Do not mark the
    // client initialized or upload local data until the cloud read succeeds.
    if (cloudQuery.isError) return;
    const cloud = cloudQuery.data;
    if (cloud) {
      revisionRef.current = cloud.revision;
      setRevision(cloud.revision);
      const forceRestore = localStorage.getItem("life-rpg-force-cloud-restore") === "1";
      if (!isLegacyDemoSave(cloud.state) && (forceRestore || cloud.state.updatedAt > useGameStore.getState().updatedAt)) {
        skipNext.current = true;
        importState(cloud.state);
      }
      if (forceRestore) localStorage.removeItem("life-rpg-force-cloud-restore");
    }
    setInitialized(true);
    setStatus(cloud ? "saved" : "idle");
  }, [authenticated, cloudQuery.data, cloudQuery.isError, cloudQuery.isLoading, importState, initialized]);

  const syncNow = useCallback(() => {
    if (!authenticated || !navigator.onLine || !initialized || cloudQuery.isError) return;
    setStatus("loading");
    mutate({ state: gameSnapshot(useGameStore.getState()), revision: revisionRef.current, deviceId: deviceId() });
  }, [authenticated, cloudQuery.isError, initialized, mutate]);

  useEffect(() => {
    if (!initialized || !authenticated) return;
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const timer = window.setTimeout(syncNow, 2200);
    return () => window.clearTimeout(timer);
  }, [updatedAt, initialized, authenticated, syncNow]);

  if (!authenticated) {
    return <p className="text-sm leading-relaxed text-muted-foreground">Войдите, чтобы синхронизировать прогресс между устройствами. Локальный прогресс сохранён на устройстве.</p>;
  }

  const visibleStatus = cloudQuery.isError ? "error" : status;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm"><Cloud size={17} aria-hidden="true" /><span>{visibleStatus === "loading" ? "Синхронизация…" : visibleStatus === "saved" ? `Облако · ревизия ${revision ?? 1}` : visibleStatus === "error" ? "Не удалось синхронизировать" : "Облако готово"}</span></div>
        <button type="button" onClick={syncNow} disabled={status === "loading" || !initialized || cloudQuery.isError} className="quiet-button inline-flex items-center gap-2 rounded-lg px-3 text-xs disabled:opacity-50"><RefreshCw size={14} className={visibleStatus === "loading" ? "animate-spin" : ""} aria-hidden="true" />Сейчас</button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Изменения отправляются автоматически через 2 секунды. При конфликте синхронизация останавливается до повторного чтения облачной версии; локальная офлайн-копия сохраняется.</p>
      {visibleStatus === "error" && <p role="alert" className="mt-2 text-xs text-foreground">Проверьте соединение. Локальный прогресс не потерян — повторите синхронизацию вручную.</p>}
    </div>
  );
}
