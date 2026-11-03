import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { QUEST_TYPE_LABELS, type Quest, type QuestType } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { QuestCard } from "@/components/game/QuestCard";
import { QuestForm } from "@/components/game/QuestForm";
import { CompletionDialog } from "@/components/game/CompletionDialog";
import { EmptyState, PageHeader, SectionHeading } from "@/components/game/ui";

type Filter = "ALL" | Exclude<QuestType, "HABIT">;

export default function Quests() {
  const quests = useGameStore((state) => state.quests);
  const deleteQuest = useGameStore((state) => state.deleteQuest);
  const duplicateQuest = useGameStore((state) => state.duplicateQuest);
  const [tab, setTab] = useState<"active" | "done">("active");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<QuestType>("SIDE");
  const [selected, setSelected] = useState<Quest | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<"newest" | "shortest" | "xp">("newest");

  const habits = useMemo(() => quests.filter((quest) => quest.type === "HABIT"), [quests]);
  const active = useMemo(() => quests.filter((quest) => quest.type !== "HABIT" && !quest.done && (filter === "ALL" || quest.type === filter) && `${quest.title} ${quest.description} ${quest.completionCriteria}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === "shortest" ? a.minutes - b.minutes : sort === "xp" ? b.xp - a.xp : b.createdAt.localeCompare(a.createdAt)), [quests, filter, search, sort]);
  const done = useMemo(() => quests.filter((quest) => quest.type !== "HABIT" && quest.done).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [quests]);
  const openForm = (type: QuestType) => { setFormType(type); setFormOpen(true); };

  return (
    <>
      <PageHeader eyebrow="Журнал действий" title="Квесты" description="Активное — впереди. Завершённое не мешает фокусу и хранится в архиве." action={<button type="button" onClick={() => openForm("SIDE")} className="press-button grid h-12 w-12 place-items-center rounded-full" aria-label="Добавить квест"><Plus size={21} aria-hidden="true" /></button>} />

      <div className="mb-6 grid grid-cols-2 rounded-xl border border-border p-1" role="tablist" aria-label="Состояние квестов">
        {(["active", "done"] as const).map((item) => (
          <button key={item} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)} className={`min-h-11 rounded-lg text-sm font-medium transition-transform active:scale-[0.98] ${tab === item ? "bg-secondary text-foreground" : "text-muted-foreground"}`}>
            {item === "active" ? "Активные" : `Готово · ${done.length}`}
          </button>
        ))}
      </div>

      {tab === "active" ? (
        <>
          <section className="mb-8" aria-labelledby="habit-block">
            <SectionHeading title="Привычки" meta="ежедневный reset" action={<button type="button" onClick={() => openForm("HABIT")} className="quiet-button rounded-lg px-3 text-xs">Добавить</button>} />
            <div id="habit-block">
              {habits.length ? habits.map((quest) => <QuestCard key={quest.id} quest={quest} onComplete={setSelected} onDelete={(item) => { if (window.confirm(`Удалить квест «${item.title}»?`)) { deleteQuest(item.id); toast.success("Квест удалён"); } }} onDuplicate={(item) => { duplicateQuest(item.id); toast.success("Квест скопирован"); }} />) : <EmptyState title="Нет ежедневного ритуала" text="Добавьте действие на 2–15 минут. Его можно отметить за три секунды и снять отметку сегодня." actionLabel="Создать привычку" onAction={() => openForm("HABIT")} />}
            </div>
          </section>

          <section aria-labelledby="one-time-block">
            <SectionHeading title="Разовые квесты" meta={`${active.length} активных`} />
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="field pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск по квестам" aria-label="Поиск по квестам" /></label>
              <select className="field sm:w-48" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Сортировка"><option value="newest">Сначала новые</option><option value="shortest">Сначала короткие</option><option value="xp">Больше XP</option></select>
            </div>
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Фильтр типа квеста">
              {(["ALL", "MAIN", "SIDE", "BOSS"] as Filter[]).map((item) => (
                <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`min-h-11 shrink-0 rounded-full border px-4 text-xs ${filter === item ? "border-foreground text-foreground" : "border-border text-muted-foreground"}`}>
                  {item === "ALL" ? "Все" : QUEST_TYPE_LABELS[item]}
                </button>
              ))}
            </div>
            <div id="one-time-block">
              {active.length ? active.map((quest) => <QuestCard key={quest.id} quest={quest} onComplete={setSelected} />) : <EmptyState title="Здесь стало тихо" text="Добавьте следующий шаг или измените фильтр. Новичку достаточно одного реалистичного действия." actionLabel="Новый квест" onAction={() => openForm("SIDE")} />}
            </div>
          </section>
        </>
      ) : (
        <section aria-label="Архив завершённых квестов">
          <p className="mb-3 text-sm text-muted-foreground">Разовые квесты попадают сюда с датой и временем завершения.</p>
          {done.length ? done.map((quest) => (
            <div key={quest.id}>
              <QuestCard quest={quest} onComplete={setSelected} archived />
              {quest.completedAt && <p className="-mt-3 mb-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(quest.completedAt))}{quest.reflection ? ` · ${quest.reflection}` : ""}</p>}
            </div>
          )) : <EmptyState title="Архив пока пуст" text="Первый подтверждённый результат появится здесь автоматически." actionLabel="К активным квестам" onAction={() => setTab("active")} />}
        </section>
      )}
      <QuestForm open={formOpen} onOpenChange={setFormOpen} defaultType={formType} />
      <CompletionDialog quest={selected} onClose={() => setSelected(null)} />
    </>
  );
}
