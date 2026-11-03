import { useMemo, useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Flame, Plus, ShieldCheck } from "lucide-react";
import { levelProgress, titleForLevel, type Quest, type QuestType } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { QuestCard } from "@/components/game/QuestCard";
import { QuestForm } from "@/components/game/QuestForm";
import { CompletionDialog } from "@/components/game/CompletionDialog";
import { Modal } from "@/components/game/Modal";
import { PageHeader, ProgressBar, SectionHeading } from "@/components/game/ui";

export default function Home() {
  const hero = useGameStore((state) => state.hero);
  const quests = useGameStore((state) => state.quests);
  const lore = useGameStore((state) => state.lore);
  const onboardingSeen = useGameStore((state) => state.settings.onboardingSeen);
  const setSettings = useGameStore((state) => state.setSettings);
  const [selected, setSelected] = useState<Quest | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formType, setFormType] = useState<QuestType>("SIDE");
  const progress = levelProgress(hero.xp);
  const active = useMemo(() => quests.filter((quest) => !quest.done && quest.type !== "HABIT").slice(0, 3), [quests]);
  const habits = useMemo(() => quests.filter((quest) => quest.type === "HABIT").slice(0, 2), [quests]);
  const achievements = [
    { label: "Первый шаг", unlocked: hero.totalCompleted >= 1 },
    { label: "Серия ×7", unlocked: hero.streakDays >= 7 },
    { label: "10 привычек", unlocked: hero.habitCompletions >= 10 },
    { label: "Первый босс", unlocked: hero.bossCompleted >= 1 },
  ];
  const openForm = (type: QuestType) => { setFormType(type); setFormOpen(true); };

  return (
    <>
      <PageHeader eyebrow={new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date())} title={`Герой, ${hero.name}`} description="Не список задач, а история реальных действий. Сегодня достаточно одного честного шага." />

      <section aria-label="Прогресс героя" className="mb-7 grid grid-cols-2 gap-3">
        <div className="surface col-span-2 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="game-label">Текущий уровень</p>
              <div className="mt-3 flex items-end gap-3">
                <span className="display-number text-7xl font-semibold">{hero.level}</span>
                <span className="pb-1 text-sm text-muted-foreground">{titleForLevel(hero.level)}</span>
              </div>
            </div>
            <div className="text-right font-mono text-xs text-muted-foreground">
              <span className="text-lg font-semibold text-foreground">{hero.xp}</span> XP<br />до {progress.end}
            </div>
          </div>
          <div className="mt-5"><ProgressBar value={progress.percent} label={`${Math.round(progress.percent)} процентов до уровня ${hero.level + 1}`} /></div>
          <p className="mt-2 text-xs text-muted-foreground">{progress.current} / {progress.required} XP в этом уровне</p>
        </div>
        <div className="border-y border-border py-4">
          <p className="game-label flex items-center gap-1.5"><Flame size={13} aria-hidden="true" /> Серия</p>
          <p className="display-number mt-2 text-4xl font-semibold">{hero.streakDays}<span className="ml-1 text-sm font-normal tracking-normal text-muted-foreground">дн.</span></p>
          <p className="mt-1 text-xs text-muted-foreground">Один пропуск не обнуляет путь</p>
        </div>
        <div className="border-y border-border py-4 pl-4">
          <p className="game-label flex items-center gap-1.5"><ShieldCheck size={13} aria-hidden="true" /> Завершено</p>
          <p className="display-number mt-2 text-4xl font-semibold">{hero.totalCompleted}</p>
          <p className="mt-1 text-xs text-muted-foreground">только подтверждённые результаты</p>
        </div>
      </section>

      <div className="mb-8 grid grid-cols-2 gap-3">
        <button type="button" onClick={() => openForm("SIDE")} className="press-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold"><Plus size={17} aria-hidden="true" /> Квест</button>
        <button type="button" onClick={() => openForm("HABIT")} className="quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium"><Plus size={17} aria-hidden="true" /> Привычка</button>
      </div>

      <section className="mb-8" aria-labelledby="today-habits">
        <SectionHeading title="Быстрые привычки" meta="отметка за 3 секунды" />
        <div id="today-habits">
          {habits.map((quest) => <QuestCard key={quest.id} quest={quest} onComplete={setSelected} />)}
        </div>
      </section>

      <section className="mb-8" aria-labelledby="active-quests">
        <SectionHeading title="Активные квесты" meta={`${active.length} в фокусе`} action={<Link to="/quests" className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground">Все <ArrowRight size={15} aria-hidden="true" /></Link>} />
        <div id="active-quests">
          {active.length ? active.map((quest) => <QuestCard key={quest.id} quest={quest} onComplete={setSelected} />) : <p className="border-y border-border py-5 text-sm text-muted-foreground">Все разовые квесты завершены. Добавьте следующий реальный шаг.</p>}
        </div>
      </section>

      <section className="mb-8" aria-labelledby="achievements">
        <SectionHeading title="Титулы и достижения" />
        <div id="achievements" className="flex flex-wrap gap-2">
          {achievements.map((item) => <span key={item.label} className={`rounded-full border px-3 py-1.5 text-xs ${item.unlocked ? "border-foreground text-foreground" : "border-border text-muted-foreground opacity-55"}`}>{item.unlocked ? "◆" : "◇"} {item.label}</span>)}
        </div>
      </section>

      {lore[0] && <section className="lore-line pl-4" aria-labelledby="latest-lore">
        <p className="game-label">Лор · автозапись</p>
        <h2 id="latest-lore" className="mt-2 text-lg font-medium">{lore[0].title}</h2>
        <p className="mt-1 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{lore[0].text}</p>
      </section>}

      <Modal open={!onboardingSeen} onOpenChange={(open) => !open && setSettings({ onboardingSeen: true })} title="Реальная жизнь — это главная кампания" description="LIFE RPG начисляет прогресс не за открытия, а за подтверждённые результаты.">
        <div className="space-y-4 py-3 text-sm leading-relaxed">
          <p><strong className="text-foreground">1. Начните с малого.</strong><br /><span className="text-muted-foreground">Привычка на 2–15 минут возвращается каждый день. Серия прощает один пропуск.</span></p>
          <p><strong className="text-foreground">2. Проверяйте результат.</strong><br /><span className="text-muted-foreground">У каждого квеста есть измеримый критерий. Выполненное уходит в архив.</span></p>
          <p><strong className="text-foreground">3. Качайте ветку.</strong><br /><span className="text-muted-foreground">XP одновременно двигает героя, направление, навык и связанную цель.</span></p>
          <button type="button" onClick={() => setSettings({ onboardingSeen: true })} className="press-button w-full rounded-xl px-4 text-sm font-semibold">Выбрать первый шаг</button>
        </div>
      </Modal>
      <QuestForm open={formOpen} onOpenChange={setFormOpen} defaultType={formType} />
      <CompletionDialog quest={selected} onClose={() => setSelected(null)} />
    </>
  );
}
