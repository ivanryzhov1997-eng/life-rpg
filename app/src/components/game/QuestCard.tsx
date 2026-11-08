import { Check, Clock3, Copy, Pencil, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import type { Quest } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { TypeBadge } from "./ui";

export function QuestCard({ quest, onComplete, archived = false, onDelete, onDuplicate, onEdit, onUndo }: { quest: Quest; onComplete: (quest: Quest) => void; archived?: boolean; onDelete?: (quest: Quest) => void; onDuplicate?: (quest: Quest) => void; onEdit?: (quest: Quest) => void; onUndo?: (quest: Quest) => void }) {
  const direction = useGameStore((state) => state.directions.find((item) => item.id === quest.directionId));
  const undoHabit = useGameStore((state) => state.undoHabit);
  const isHabit = quest.type === "HABIT";

  return (
    <article className="border-b border-border py-4 last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <TypeBadge type={quest.type} />
            {quest.fromAi && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles size={12} aria-hidden="true" /> ИИ-черновик</span>}
          </div>
          <h3 className={`text-base font-medium leading-snug ${quest.done && !isHabit ? "text-muted-foreground" : ""}`}>{quest.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{quest.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock3 size={13} aria-hidden="true" />{quest.minutes} мин</span>
            <span>{direction?.name ?? "Без направления"}</span>
            {isHabit && <span>Серия {quest.habitStreak}</span>}
            <span className="ml-auto font-mono text-sm font-semibold text-foreground">+{quest.xp} XP</span>
          </div>
        </div>
        {!archived && !isHabit && <div className="flex shrink-0 flex-col gap-1">
          <button type="button" onClick={() => onEdit?.(quest)} className="quiet-button grid h-9 w-9 place-items-center rounded-lg" aria-label={`Редактировать: ${quest.title}`}><Pencil size={15} /></button>
          <button type="button" onClick={() => onDuplicate?.(quest)} className="quiet-button grid h-9 w-9 place-items-center rounded-lg" aria-label={`Копировать: ${quest.title}`}><Copy size={15} /></button>
          <button type="button" onClick={() => onDelete?.(quest)} className="quiet-button grid h-9 w-9 place-items-center rounded-lg text-destructive" aria-label={`Удалить: ${quest.title}`}><Trash2 size={15} /></button>
        </div>}
        {archived ? (
          <button type="button" onClick={() => onUndo?.(quest)} className="quiet-button grid h-11 w-11 shrink-0 place-items-center rounded-full" aria-label={`Отменить завершение: ${quest.title}`}><RotateCcw size={17} aria-hidden="true" /></button>
        ) : isHabit && quest.done ? (
          <button type="button" onClick={() => undoHabit(quest.id)} className="quiet-button grid h-12 w-12 shrink-0 place-items-center rounded-full" aria-label={`Снять отметку: ${quest.title}`}>
            <RotateCcw size={19} aria-hidden="true" />
          </button>
        ) : (
          <button type="button" onClick={() => onComplete(quest)} className="press-button grid h-12 w-12 shrink-0 place-items-center rounded-full" aria-label={`Отметить выполненным: ${quest.title}`}>
            <Check size={21} strokeWidth={2.5} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
