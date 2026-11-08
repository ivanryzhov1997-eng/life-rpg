import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { Quest } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { Modal } from "./Modal";

export function CompletionDialog({ quest, onClose }: { quest: Quest | null; onClose: () => void }) {
  const confirmCriteria = useGameStore((state) => state.settings.confirmCriteria);
  const completeQuest = useGameStore((state) => state.completeQuest);
  const [confirmed, setConfirmed] = useState(false);
  const [reflection, setReflection] = useState("");

  useEffect(() => {
    setConfirmed(false);
    setReflection("");
  }, [quest?.id]);

  if (!quest) return null;
  const needsReflection = quest.type === "MAIN" || quest.type === "BOSS";

  const submit = () => {
    const result = completeQuest(quest.id, reflection);
    if (!result) return;
    toast.success(`+${result.xp} XP · результат записан`, {
      description: result.luck ? "Редкий luck-бонус сработал. Удача любит завершённые дела." : result.levelUp ? "Новый уровень героя открыт." : undefined,
    });
    onClose();
  };

  return (
    <Modal open={!!quest} onOpenChange={(open) => !open && onClose()} title="Подтвердить результат" description={quest.completionCriteria}>
      <div className="space-y-4 pt-2">
        {confirmCriteria && (
          <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-5 w-5 accent-[oklch(var(--primary))]" />
            <span>Результат действительно достигнут. XP начислить за выполнение, а не за намерение.</span>
          </label>
        )}
        {needsReflection && (
          <label className="block text-sm font-medium">
            Короткая рефлексия <span className="font-normal text-muted-foreground">(необязательно)</span>
            <textarea className="field mt-2" value={reflection} onChange={(event) => setReflection(event.target.value)} maxLength={280} placeholder="Что сработало? Что усложнить или упростить в следующий раз?" />
          </label>
        )}
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="quiet-button flex-1 rounded-xl px-4 text-sm">Отмена</button>
          <button type="button" onClick={submit} disabled={confirmCriteria && !confirmed} className="press-button flex-1 rounded-xl px-4 text-sm font-semibold">Получить {quest.xp} XP</button>
        </div>
      </div>
    </Modal>
  );
}
