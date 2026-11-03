import { useEffect, useState, type FormEvent } from "react";
import { GitBranch, Plus } from "lucide-react";
import { STAGE_LABELS, stageFromXp } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { Modal } from "@/components/game/Modal";
import { EmptyState, PageHeader, ProgressBar } from "@/components/game/ui";
import { AiPanel } from "@/components/game/AiPanel";
import { useAuth } from "@/hooks/useAuth";

export default function Skills() {
  const { isAuthenticated } = useAuth();
  const directions = useGameStore((state) => state.directions);
  const skills = useGameStore((state) => state.skills);
  const addDirection = useGameStore((state) => state.addDirection);
  const addSkill = useGameStore((state) => state.addSkill);
  const [selectedId, setSelectedId] = useState(directions[0]?.id ?? "");
  const [directionOpen, setDirectionOpen] = useState(false);
  const [skillOpen, setSkillOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const selected = directions.find((item) => item.id === selectedId) ?? directions[0];

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const submitDirection = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    addDirection(name, description || "Новое направление развития.");
    setName(""); setDescription(""); setDirectionOpen(false);
  };
  const submitSkill = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !selected) return;
    addSkill(selected.id, parentId || null, name);
    setName(""); setParentId(""); setSkillOpen(false);
  };

  if (!selected) return <><PageHeader title="Навыки" /><EmptyState title="Создайте первое направление" text="Например, фокус, ремесло или энергия. Дерево начнётся с одного корневого навыка." actionLabel="Добавить направление" onAction={() => setDirectionOpen(true)} /><DirectionModal open={directionOpen} onOpenChange={setDirectionOpen} name={name} setName={setName} description={description} setDescription={setDescription} onSubmit={submitDirection} /></>;

  const directionSkills = skills.filter((skill) => skill.directionId === selected.id);
  const roots = directionSkills.filter((skill) => !skill.parentId);
  const stage = stageFromXp(selected.xp);
  const nextThreshold = stage === "novice" ? 400 : stage === "intermediate" ? 1500 : stage === "advanced" ? 5000 : 5000;
  const prevThreshold = stage === "novice" ? 0 : stage === "intermediate" ? 400 : stage === "advanced" ? 1500 : 5000;
  const stagePercent = stage === "pro" ? 100 : ((selected.xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100;

  const renderNode = (skillId: string, depth = 0): React.ReactNode => {
    const skill = directionSkills.find((item) => item.id === skillId);
    if (!skill) return null;
    const children = directionSkills.filter((item) => item.parentId === skillId);
    return (
      <li key={skill.id}>
        <div className={`relative flex min-h-16 items-center justify-between gap-3 border-b border-border py-3 ${depth ? "ml-6 pl-5" : ""}`}>
          {depth > 0 && <span className="absolute bottom-0 left-0 top-0 border-l border-border" aria-hidden="true" />}
          <div><p className="font-medium">{skill.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{depth === 0 ? "Корневой навык" : "Поднавык"}</p></div>
          <span className="font-mono text-xs text-muted-foreground">{skill.xp} XP</span>
        </div>
        {children.length > 0 && <ul>{children.map((child) => renderNode(child.id, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <>
      <PageHeader eyebrow="Дерево развития" title="Навыки" description="Сложность растёт вместе с направлением. XP капает и в ветку, и в общий уровень героя." action={<button type="button" onClick={() => setSkillOpen(true)} className="press-button grid h-12 w-12 place-items-center rounded-full" aria-label="Добавить навык"><Plus size={21} aria-hidden="true" /></button>} />
      <div className="mb-6 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Направления">
        {directions.map((direction) => <button key={direction.id} type="button" role="tab" aria-selected={selected.id === direction.id} onClick={() => setSelectedId(direction.id)} className={`min-h-11 shrink-0 rounded-full border px-4 text-sm ${selected.id === direction.id ? "border-foreground" : "border-border text-muted-foreground"}`}>{direction.name}</button>)}
        <button type="button" onClick={() => setDirectionOpen(true)} className="quiet-button shrink-0 rounded-full px-4 text-xs">+ Направление</button>
      </div>

      <section className="surface mb-7 p-5" aria-label={`Стадия направления ${selected.name}`}>
        <div className="flex items-start justify-between gap-4">
          <div><p className="game-label">Стадия направления</p><h2 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">{STAGE_LABELS[stage]}</h2><p className="mt-2 max-w-[55ch] text-sm text-muted-foreground">{selected.description}</p></div>
          <GitBranch className="text-muted-foreground" size={28} strokeWidth={1.4} aria-hidden="true" />
        </div>
        <div className="mt-5"><ProgressBar value={stagePercent} label={`Прогресс направления ${selected.name}`} /></div>
        <p className="mt-2 font-mono text-xs text-muted-foreground">{selected.xp} XP{stage !== "pro" ? ` · ${nextThreshold} XP до следующей стадии` : " · максимальная стадия"}</p>
      </section>

      <section className="surface mb-7 p-5" aria-labelledby="ai-tools">
        <div className="mb-4"><p className="game-label">AI / LIFE RPG</p><h2 id="ai-tools" className="mt-1 text-lg font-semibold">ИИ-наставник</h2><p className="mt-1 text-sm text-muted-foreground">Диагностика, квесты на день и направление, построение дерева навыков.</p></div>
        <AiPanel authenticated={isAuthenticated} />
      </section>

      <section aria-labelledby="skill-tree">
        <div className="mb-2 flex items-center justify-between"><h2 id="skill-tree" className="text-lg font-semibold">Дерево · {selected.name}</h2><span className="text-xs text-muted-foreground">{directionSkills.length} узлов</span></div>
        {roots.length ? <ul>{roots.map((skill) => renderNode(skill.id))}</ul> : <EmptyState title="Ветка ещё не выросла" text="Добавьте корневой навык, затем конкретные поднавыки. Ничего не записывается без вашего подтверждения." actionLabel="Добавить корневой навык" onAction={() => setSkillOpen(true)} />}
      </section>

      <DirectionModal open={directionOpen} onOpenChange={setDirectionOpen} name={name} setName={setName} description={description} setDescription={setDescription} onSubmit={submitDirection} />
      <Modal open={skillOpen} onOpenChange={setSkillOpen} title={`Новый навык · ${selected.name}`} description="Сначала выберите место в дереве, затем подтвердите запись.">
        <form onSubmit={submitSkill} className="space-y-4 pt-2">
          <label className="block text-sm font-medium">Название<input autoFocus className="field mt-1.5" value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Например, спокойный старт" /></label>
          <label className="block text-sm font-medium">Родительский узел<select className="field mt-1.5" value={parentId} onChange={(event) => setParentId(event.target.value)}><option value="">Корневой навык</option>{directionSkills.map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
          <button type="submit" className="press-button w-full rounded-xl px-4 text-sm font-semibold">Добавить в дерево</button>
        </form>
      </Modal>
    </>
  );
}

function DirectionModal({ open, onOpenChange, name, setName, description, setDescription, onSubmit }: { open: boolean; onOpenChange: (open: boolean) => void; name: string; setName: (value: string) => void; description: string; setDescription: (value: string) => void; onSubmit: (event: FormEvent) => void }) {
  return <Modal open={open} onOpenChange={onOpenChange} title="Новое направление" description="Новичковая стадия не ограничивает амбиции — она защищает от нереалистичных квестов."><form onSubmit={onSubmit} className="space-y-4 pt-2"><label className="block text-sm font-medium">Название<input autoFocus className="field mt-1.5" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} /></label><label className="block text-sm font-medium">Зачем это направление<textarea className="field mt-1.5" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} /></label><button type="submit" className="press-button w-full rounded-xl px-4 text-sm font-semibold">Создать направление</button></form></Modal>;
}
