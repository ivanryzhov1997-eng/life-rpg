import { useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { HORIZON_LABELS, horizons, type Horizon } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { Modal } from "@/components/game/Modal";
import { EmptyState, PageHeader, ProgressBar } from "@/components/game/ui";

export default function Goals() {
  const goals = useGameStore((state) => state.goals);
  const directions = useGameStore((state) => state.directions);
  const quests = useGameStore((state) => state.quests);
  const addGoal = useGameStore((state) => state.addGoal);
  const setGoalProgress = useGameStore((state) => state.setGoalProgress);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [horizon, setHorizon] = useState<Horizon>("short");
  const [target, setTarget] = useState(10);
  const [unit, setUnit] = useState("шагов");
  const [directionId, setDirectionId] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !unit.trim() || target <= 0) return;
    addGoal({ title: title.trim(), horizon, target, unit: unit.trim(), directionId: directionId || null });
    setTitle(""); setOpen(false);
  };

  return (
    <>
      <PageHeader eyebrow="Карта кампании" title="Цели" description="Три горизонта, числовая метрика и прогресс от связанных квестов — никаких процентов на глаз." action={<button type="button" onClick={() => setOpen(true)} className="press-button grid h-12 w-12 place-items-center rounded-full" aria-label="Добавить цель"><Plus size={21} aria-hidden="true" /></button>} />
      {goals.length ? horizons.map((item) => {
        const group = goals.filter((goal) => goal.horizon === item);
        if (!group.length) return null;
        return <section key={item} className="mb-8" aria-labelledby={`goal-${item}`}>
          <div className="mb-2 flex items-baseline justify-between"><h2 id={`goal-${item}`} className="text-lg font-semibold">{HORIZON_LABELS[item]}</h2><span className="text-xs text-muted-foreground">{group.length}</span></div>
          {group.map((goal) => {
            const linked = quests.filter((quest) => quest.goalId === goal.id && !quest.done).length;
            const direction = directions.find((item) => item.id === goal.directionId);
            return <article key={goal.id} className="border-b border-border py-5 last:border-b-0">
              <div className="flex items-start justify-between gap-4"><div><h3 className="text-base font-medium">{goal.title}</h3><p className="mt-1 text-xs text-muted-foreground">{direction?.name ?? "Общая цель"} · {linked} связанных активных квестов</p></div><p className="shrink-0 font-mono text-sm"><strong className="text-xl text-foreground">{goal.current}</strong><span className="text-muted-foreground"> / {goal.target}</span></p></div>
              <div className="mt-4"><ProgressBar value={(goal.current / goal.target) * 100} label={`${goal.title}: ${goal.current} из ${goal.target} ${goal.unit}`} /></div>
              <p className="mt-2 text-xs text-muted-foreground">{goal.unit}{goal.current >= goal.target ? " · цель достигнута" : ""}</p>
            </article>;
          })}
        </section>;
      }) : <EmptyState title="Наметьте первую вершину" text="Выберите горизонт и единицу измерения: страницы, тренировки, часы или законченные этапы." actionLabel="Добавить цель" onAction={() => setOpen(true)} />}

      <Modal open={open} onOpenChange={setOpen} title="Новая цель" description="Метрика должна меняться от реальных действий. Затем привяжите квесты к этой цели.">
        <form onSubmit={submit} className="space-y-4 pt-2">
          <label className="block text-sm font-medium">Название<input autoFocus className="field mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={160} placeholder="Например, выпустить 6 черновиков" /></label>
          <label className="block text-sm font-medium">Горизонт<select className="field mt-1.5" value={horizon} onChange={(event) => setHorizon(event.target.value as Horizon)}>{horizons.map((item) => <option key={item} value={item}>{HORIZON_LABELS[item]}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">Цель<input type="number" min={1} step={0.1} className="field mt-1.5" value={target} onChange={(event) => setTarget(Number(event.target.value))} required /></label><label className="block text-sm font-medium">Единица<input className="field mt-1.5" value={unit} onChange={(event) => setUnit(event.target.value)} required maxLength={40} /></label></div>
          <label className="block text-sm font-medium">Направление<select className="field mt-1.5" value={directionId} onChange={(event) => setDirectionId(event.target.value)}><option value="">Общая цель</option>{directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <button type="submit" className="press-button w-full rounded-xl px-4 text-sm font-semibold">Добавить на карту</button>
        </form>
      </Modal>
    </>
  );
}
