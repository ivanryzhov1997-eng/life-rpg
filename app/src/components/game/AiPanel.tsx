import { useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { QUEST_TYPE_LABELS, STAGE_LABELS } from "@contracts/game";
import { trpc } from "@/providers/trpc";
import { useGameStore } from "@/store/gameStore";

type Mode = "day" | "mentor" | "diagnose" | "tree";
const modes: { id: Mode; label: string }[] = [
  { id: "day", label: "На день" },
  { id: "mentor", label: "Наставник" },
  { id: "diagnose", label: "Диагноз" },
  { id: "tree", label: "Дерево" },
];

export function AiPanel({ authenticated }: { authenticated: boolean }) {
  const directions = useGameStore((state) => state.directions);
  const skills = useGameStore((state) => state.skills);
  const acceptAiDrafts = useGameStore((state) => state.acceptAiDrafts);
  const addSkill = useGameStore((state) => state.addSkill);
  const [mode, setMode] = useState<Mode>("day");
  const [directionId, setDirectionId] = useState(directions[0]?.id ?? "");
  const [question, setQuestion] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [energy, setEnergy] = useState<"low" | "medium" | "high">("medium");
  const direction = directions.find((item) => item.id === directionId) ?? directions[0];
  const statusQuery = trpc.ai.status.useQuery(undefined, { enabled: authenticated, retry: false, staleTime: 60_000 });
  const assist = trpc.ai.assist.useMutation({
    onError: (error) => toast.error(error.message),
  });
  const result = assist.data;

  if (!authenticated) {
    return <div><p className="text-sm leading-relaxed text-muted-foreground">ИИ работает через серверный Groq API. Анонимный профиль создаётся автоматически; ключ не попадает в браузер.</p><p className="mt-2 text-xs text-muted-foreground">ИИ станет доступен после настройки GROQ_API_KEY на сервере.</p></div>;
  }
  if (!direction) return <p className="text-sm text-muted-foreground">Сначала создайте направление в разделе «Навыки».</p>;

  const generate = () => {
    assist.reset();
    assist.mutate({
      mode, question, minutes, energy, directionName: direction.name, stage: direction.stage,
      existingSkills: skills.filter((skill) => skill.directionId === direction.id).map((skill) => skill.name),
    });
  };
  const acceptQuests = () => {
    if (!result?.quests.length) return;
    acceptAiDrafts(direction.id, result.quests);
    toast.success(`${result.quests.length} квестов принято в журнал`);
    assist.reset();
  };
  const acceptTree = () => {
    if (!result?.skills.length) return;
    const idsByName = new Map(skills.filter((skill) => skill.directionId === direction.id).map((skill) => [skill.name, skill.id]));
    for (const skill of result.skills) {
      const parentId = skill.parentName ? idsByName.get(skill.parentName) ?? null : null;
      const id = addSkill(direction.id, parentId, skill.name);
      idsByName.set(skill.name, id);
    }
    toast.success("Черновик дерева принят");
    assist.reset();
  };

  return (
    <div>
      <div className="mb-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Sparkles size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><p>{statusQuery.data?.message ?? "Проверяем серверный proxy…"} Ответ всегда остаётся черновиком до вашего подтверждения.</p></div>
      <div className="mb-4 grid grid-cols-4 rounded-xl border border-border p-1" role="tablist" aria-label="Режим ИИ">
        {modes.map((item) => <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} onClick={() => { setMode(item.id); assist.reset(); }} className={`min-h-11 rounded-lg text-xs ${mode === item.id ? "bg-secondary" : "text-muted-foreground"}`}>{item.label}</button>)}
      </div>
      <div className="space-y-3">
        <label className="block text-sm font-medium">Направление · {STAGE_LABELS[direction.stage]}<select className="field mt-1.5" value={direction.id} onChange={(event) => { setDirectionId(event.target.value); assist.reset(); }}>{directions.map((item) => <option key={item.id} value={item.id}>{item.name} · {STAGE_LABELS[item.stage]}</option>)}</select></label>
        {(mode === "day" || mode === "mentor") && <div className="grid grid-cols-2 gap-3"><label className="block text-sm font-medium">Минут<input type="number" min={5} max={240} className="field mt-1.5" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} /></label><label className="block text-sm font-medium">Энергия<select className="field mt-1.5" value={energy} onChange={(event) => setEnergy(event.target.value as typeof energy)}><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая</option></select></label></div>}
        <label className="block text-sm font-medium">{mode === "diagnose" ? "Опишите текущий уровень" : mode === "tree" ? "Что хотите уметь" : "Контекст или вопрос"}<textarea className="field mt-1.5" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={1200} placeholder={mode === "day" ? "Что важно учесть сегодня?" : "Например, знаю основы, но быстро теряю фокус…"} /></label>
        <button type="button" onClick={generate} disabled={assist.isPending || statusQuery.data?.available === false} className="press-button w-full rounded-xl px-4 text-sm font-semibold">{assist.isPending ? "Готовим черновик…" : "Получить черновик"}</button>
        {statusQuery.data?.available === false && <p role="status" className="text-xs text-muted-foreground">ИИ сейчас отключён, но это не блокирует ручное ядро и локальный прогресс.</p>}
        {assist.error && <p role="alert" className="border-y border-border py-3 text-sm">{assist.error.message}</p>}
      </div>

      {result && <div className="mt-5 border-t border-border pt-4">
        <p className="text-sm leading-relaxed">{result.advice}</p>
        {result.diagnosis && <p className="mt-3 border-l border-border pl-3 text-sm text-muted-foreground">{result.diagnosis}</p>}
        {result.quests.length > 0 && <div className="mt-4">{result.quests.map((quest, index) => <article key={`${quest.title}-${index}`} className="border-b border-border py-3"><div className="flex items-center justify-between gap-3"><p className="font-medium">{quest.title}</p><span className="font-mono text-xs">+{quest.xp} XP</span></div><p className="mt-1 text-xs text-muted-foreground">{QUEST_TYPE_LABELS[quest.type]} · {quest.minutes} мин · сложность {quest.difficulty}</p><p className="mt-2 text-sm text-muted-foreground">Критерий: {quest.completionCriteria}</p></article>)}<button type="button" onClick={acceptQuests} className="quiet-button mt-4 w-full rounded-xl px-4 text-sm font-medium">Принять квесты в журнал</button></div>}
        {result.skills.length > 0 && <div className="mt-4"><ul className="space-y-2">{result.skills.map((skill, index) => <li key={`${skill.name}-${index}`} className="border-b border-border pb-2 text-sm"><strong>{skill.name}</strong>{skill.parentName && <span className="text-muted-foreground"> · внутри «{skill.parentName}»</span>}</li>)}</ul><button type="button" onClick={acceptTree} className="quiet-button mt-4 w-full rounded-xl px-4 text-sm font-medium">Принять дерево навыков</button></div>}
      </div>}
    </div>
  );
}
