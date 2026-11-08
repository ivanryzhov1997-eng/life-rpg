import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { HORIZON_LABELS, horizons, type Goal, type Horizon } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { Modal } from "@/components/game/Modal";
import { EmptyState, PageHeader, ProgressBar } from "@/components/game/ui";

export default function Goals() {
  const goals = useGameStore((state) => state.goals);
  const directions = useGameStore((state) => state.directions);
  const quests = useGameStore((state) => state.quests);
  const addGoal = useGameStore((state) => state.addGoal);
  const updateGoal = useGameStore((state) => state.updateGoal);
  const setGoalProgress = useGameStore((state) => state.setGoalProgress);
  const deleteGoal = useGameStore((state) => state.deleteGoal);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("short");
  const [target, setTarget] = useState(10);
  const [unit, setUnit] = useState("шагов");
  const [directionId, setDirectionId] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setHorizon(editing?.horizon ?? "short");
    setTarget(editing?.target ?? 10);
    setUnit(editing?.unit ?? "шагов");
    setDirectionId(editing?.directionId ?? "");
  }, [open, editing]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !unit.trim() || !Number.isFinite(target) || target <= 0) return;
    const input = { title: title.trim(), horizon, target, unit: unit.trim(), directionId: directionId || null };
    if (editing) { updateGoal(editing.id, input); toast.success("Цель обновлена"); }
    else { addGoal(input); toast.success("Цель добавлена"); }
    setOpen(false); setEditing(null);
  };

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (goal: Goal) => { setEditing(goal); setOpen(true); };

  return (
    <>
      <PageHeader eyebrow="Карта кампании" title="Цели" description="Три горизонта, числовая метрика и прогресс от связанных квестов — никаких процентов на глаз." action={<button type="button" onClick={openCreate} className="press-button grid h-12 w-12 place-items-center rounded-full" aria-label="Добавить цель"><Plus size={21} aria-hidden="true" /></button>} />
      {goals.length ? horizons.map((item) => {
        const group = goals.filter((goal) => goal.horizon === item);
        if (!group.length) return null;
        return <section key={item} className="mb-8" aria-labelledby={`goal-${item}`}>
          <div className="mb-2 flex items-baseline justify-between"><h2 id={`goal-${item}`} className="text-lg font-semibold">{HORIZON_LABELS[item]}</h2><span className="text-xs text-muted-foreground">{group.length}</span></div>
          {group.map((goal) => {
            const linked = quests.filter((quest) => quest.goalId === goal.id && !quest.done).length;
            const direction = directions.find((entry) => entry.id === goal.directionId);
            return <article key={goal.id} className="border-b border-border py-5 last:border-b-0">
              <div className="flex items-start justify-between gap-4"><div className="min-w-0"><h3 className="text-base font-medium">{goal.title}</h3><p className="mt-1 text-xs text-muted-foreground">{direction?.name ?? "Общая цель"} · {linked} связанных активных квестов</p></div><p className="shrink-0 font-mono text-sm"><strong className="text-xl text-foreground">{goal.current}</strong><span className="text-muted-foreground"> / {goal.target}</span></p></div>
              <div className="mt-4"><ProgressBar value={(goal.current / goal.target) * 100} label={`${goal.title}: ${goal.current} из ${goal.target} ${goal.unit}`} /></div>
              <p className="mt-2 text-xs text-muted-foreground">{goal.unit}{goal.current >= goal.target ? " · цель достигнута" : ""}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" className="quiet-button min-h-9 rounded-lg px-3 text-xs" onClick={() => setGoalProgress(goal.id, goal.current - 1)}>−1</button><button type="button" className="quiet-button min-h-9 rounded-lg px-3 text-xs" onClick={() => setGoalProgress(goal.id, goal.current + 1)}>+1</button><button type="button" className="quiet-button grid h-9 w-9 place-items-center rounded-lg" aria-label={`Редактировать цель ${goal.title}`} onClick={() => openEdit(goal)}><Pencil size={15} /></button><button type="button" className="quiet-button grid h-9 w-9 place-items-center rounded-lg text-destructive" aria-label={`Удалить цель ${goal.title}`} onClick={() => { if (window.confirm(`Удалить цель «${goal.title}»? Связанные квесты сохранятся без привязки.`)) { deleteGoal(goal.id); toast.success("Цель удалена"); } }}><Trash2 size={15} /></button><span className="text-xs text-muted-foreground">Ручная корректировка прогресса</span></div>
            </article>;
          })}
        </section>;
      }) : <EmptyState title="Наметьте первую вершину" text="Выберите горизонт и единицу измерения: страницы, тренировки, часы или законченные этапы." actionLabel="Добавить цель" onAction={openCreate} />}

      <Modal open={open} onOpenChange={(value) => { setOpen(value); if (!value) setEditing(null); }} title={editing ? "Редактировать цель" : "Новая цель"} description="Метрика должна меняться от реальных действий. Затем привяжите квесты к этой цели.">
        <form onSubmit={submit} className="space-y-4 pt-2">
          <label className="block text-sm font-medium">Название<input autoFocus className="field mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Например, выпустить 6 черновиков" /></label>
          <label className="block text-sm font-medium">Горизонт<select className="field mt-1.5" value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)}>{horizons.map((item) => <option key={item} value={item}>{HORIZON_LABELS[item]}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">Цель<input type="number" min={0.1} step={0.1} className="field mt-1.5" value={target} onChange={(event) => setTarget(Number(event.target.value))} required /></label><label className="block text-sm font-medium">Единица<input className="field mt-1.5" value={unit} onChange={(event) => setUnit(event.target.value)} required maxLength={40} /></label></div>
          <label className="block text-sm font-medium">Направление<select className="field mt-1.5" value={directionId} onChange={(event) => setDirectionId(event.target.value)}><option value="">Общая цель</option>{directions.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <button type="submit" className="press-button w-full rounded-xl px-4 text-sm font-semibold">{editing ? "Сохранить изменения" : "Добавить на карту"}</button>
        </form>
      </Modal>
    </>
  );
}
