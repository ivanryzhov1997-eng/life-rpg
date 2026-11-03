import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, ChevronRight, GitBranch, ListTree, Network, Pencil, Plus, Search, Trash2 } from "lucide-react";
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
  const updateDirection = useGameStore((state) => state.updateDirection);
  const deleteDirection = useGameStore((state) => state.deleteDirection);
  const addSkill = useGameStore((state) => state.addSkill);
  const updateSkill = useGameStore((state) => state.updateSkill);
  const deleteSkill = useGameStore((state) => state.deleteSkill);
  const [selectedId, setSelectedId] = useState(directions[0]?.id ?? "");
  const [directionOpen, setDirectionOpen] = useState(false);
  const [directionEditOpen, setDirectionEditOpen] = useState(false);
  const [editDirectionName, setEditDirectionName] = useState("");
  const [editDirectionDescription, setEditDirectionDescription] = useState("");
  const [skillOpen, setSkillOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState("");
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editParentId, setEditParentId] = useState("");
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [treeMode, setTreeMode] = useState<"list" | "map">("map");
  const [treeSearch, setTreeSearch] = useState("");
  const [treeZoom, setTreeZoom] = useState(100);
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

  if (!selected) return (
    <>
      <PageHeader title="Навыки" description="Создайте направление развития, чтобы ИИ мог строить для него квесты и дерево навыков." />
      <EmptyState title="Создайте первое направление" text="Например, английский, программирование или гитара. После создания ИИ сможет учитывать цель, стадию и ваши навыки." actionLabel="Добавить направление" onAction={() => setDirectionOpen(true)} />
      <section className="surface mt-7 p-5" aria-labelledby="ai-tools-empty">
        <div className="mb-4"><p className="game-label">AI / LIFE RPG</p><h2 id="ai-tools-empty" className="mt-1 text-lg font-semibold">ИИ-наставник</h2><p className="mt-1 text-sm text-muted-foreground">Подготовка квестов, диагностика и построение дерева навыков.</p></div>
        <AiPanel authenticated={isAuthenticated} />
      </section>
      <Modal open={directionEditOpen} onOpenChange={setDirectionEditOpen} title="Изменить направление" description="Квесты и накопленный опыт сохранятся."><form onSubmit={(event) => { event.preventDefault(); if (editDirectionName.trim()) { updateDirection(selected.id, { name: editDirectionName, description: editDirectionDescription }); setDirectionEditOpen(false); } }} className="space-y-4 pt-2"><label className="block text-sm font-medium">Название<input className="field mt-1.5" value={editDirectionName} onChange={(event) => setEditDirectionName(event.target.value)} required maxLength={100} /></label><label className="block text-sm font-medium">Описание<textarea className="field mt-1.5" value={editDirectionDescription} onChange={(event) => setEditDirectionDescription(event.target.value)} maxLength={500} /></label><button type="submit" className="press-button w-full rounded-xl px-4 text-sm font-semibold">Сохранить</button></form></Modal>
      <DirectionModal open={directionOpen} onOpenChange={setDirectionOpen} name={name} setName={setName} description={description} setDescription={setDescription} onSubmit={submitDirection} />
    </>
  );

  const directionSkills = skills.filter((skill) => skill.directionId === selected.id);
  const roots = directionSkills.filter((skill) => !skill.parentId);
  const query = treeSearch.trim().toLocaleLowerCase();
  const matchingIds = query ? (() => {
    const matches = new Set<string>();
    for (const skill of directionSkills) {
      if (!skill.name.toLocaleLowerCase().includes(query)) continue;
      let current: (typeof directionSkills)[number] | undefined = skill;
      while (current) { matches.add(current.id); current = current.parentId ? directionSkills.find((item) => item.id === current?.parentId) : undefined; }
    }
    return matches;
  })() : null;
  const stage = stageFromXp(selected.xp);
  const nextThreshold = stage === "novice" ? 400 : stage === "intermediate" ? 1500 : stage === "advanced" ? 5000 : 5000;
  const prevThreshold = stage === "novice" ? 0 : stage === "intermediate" ? 400 : stage === "advanced" ? 1500 : 5000;
  const stagePercent = stage === "pro" ? 100 : ((selected.xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100;

  const renderNode = (skillId: string, depth = 0): React.ReactNode => {
    const skill = directionSkills.find((item) => item.id === skillId);
    if (!skill) return null;
    const children = directionSkills.filter((item) => item.parentId === skillId);
    const collapsed = collapsedIds.has(skillId);
    if (matchingIds && !matchingIds.has(skillId)) return null;
    return (
      <li key={skill.id} className={treeMode === "map" ? "border-l border-border pl-4" : ""}>
        <div className={"relative flex min-h-16 items-center justify-between gap-3 border-b border-border py-3 " + (depth ? "ml-6 pl-5 " : "") + (treeMode === "map" ? "surface mb-2 min-w-[260px] max-w-[360px] rounded-xl border px-3" : "")}>
          {depth > 0 && <span className="absolute bottom-0 left-0 top-0 border-l border-border" aria-hidden="true" />}
          <div className="min-w-0 flex-1"><p className="font-medium">{skill.name}</p><p className="mt-0.5 text-xs text-muted-foreground">{depth === 0 ? "Корневой навык" : "Поднавык"}{children.length ? ` · ${children.length} поднавыков` : ""}</p></div>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">{skill.xp} XP</span>
          {children.length > 0 && <button type="button" className="quiet-button grid h-9 w-9 shrink-0 place-items-center rounded-lg" aria-label={collapsed ? `Развернуть ${skill.name}` : `Свернуть ${skill.name}`} aria-expanded={!collapsed} onClick={() => setCollapsedIds((current) => { const next = new Set(current); if (next.has(skillId)) next.delete(skillId); else next.add(skillId); return next; })}>{collapsed ? <ChevronRight size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}</button>}
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" className="quiet-button grid h-9 w-9 place-items-center rounded-lg" aria-label={`Редактировать навык ${skill.name}`} onClick={() => { setEditingSkill(skill.id); setEditName(skill.name); setEditParentId(skill.parentId ?? ""); }}><Pencil size={16} aria-hidden="true" /></button>
            <button type="button" className="quiet-button grid h-9 w-9 place-items-center rounded-lg text-destructive" aria-label={`Удалить навык ${skill.name} и его поднавыки`} onClick={() => { if (window.confirm(`Удалить «${skill.name}» и все вложенные поднавыки? Квесты сохранятся, но отвяжутся от удалённых навыков.`)) deleteSkill(skill.id); }}><Trash2 size={16} aria-hidden="true" /></button>
          </div>
        </div>
        {children.length > 0 && (!collapsed || !!matchingIds) && <ul>{children.map((child) => renderNode(child.id, depth + 1))}</ul>}
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
        <div className="mb-3 flex justify-end gap-2"><button type="button" className="quiet-button inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs" onClick={() => { setEditDirectionName(selected.name); setEditDirectionDescription(selected.description); setDirectionEditOpen(true); }}><Pencil size={14} />Изменить направление</button><button type="button" disabled={directions.length <= 1} className="quiet-button inline-flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs text-destructive disabled:opacity-40" onClick={() => { if (directions.length > 1 && window.confirm(`Удалить направление «${selected.name}»? Его навыки удалятся, квесты перейдут в другое направление, цели станут общими.`)) { deleteDirection(selected.id); setSelectedId(directions.find((item) => item.id !== selected.id)?.id ?? ""); } }}><Trash2 size={14} />Удалить</button></div>
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="skill-tree" className="text-lg font-semibold">Дерево · {selected.name}</h2><p className="mt-1 text-xs text-muted-foreground">{directionSkills.length} узлов · выберите вид и масштаб</p></div><div className="flex rounded-xl border border-border p-1" aria-label="Режим отображения дерева"><button type="button" onClick={() => setTreeMode("map")} aria-pressed={treeMode === "map"} className={"grid h-9 w-10 place-items-center rounded-lg " + (treeMode === "map" ? "bg-secondary" : "text-muted-foreground")} aria-label="Карта дерева"><Network size={16} /></button><button type="button" onClick={() => setTreeMode("list")} aria-pressed={treeMode === "list"} className={"grid h-9 w-10 place-items-center rounded-lg " + (treeMode === "list" ? "bg-secondary" : "text-muted-foreground")} aria-label="Список дерева"><ListTree size={16} /></button></div></div>
        {roots.length ? <>
          <div className="mb-3 flex flex-wrap items-center gap-2"><label className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input className="field pl-9" value={treeSearch} onChange={(event) => setTreeSearch(event.target.value)} placeholder="Найти навык" aria-label="Поиск навыка в дереве" /></label><button type="button" className="quiet-button min-h-10 rounded-lg px-3 text-xs" onClick={() => setCollapsedIds(new Set())}>Развернуть всё</button><button type="button" className="quiet-button min-h-10 rounded-lg px-3 text-xs" onClick={() => setCollapsedIds(new Set(directionSkills.filter((skill) => directionSkills.some((child) => child.parentId === skill.id)).map((skill) => skill.id)))}>Свернуть всё</button></div>
          {treeMode === "map" && <div className="mb-3 flex items-center gap-3"><span className="text-xs text-muted-foreground">Масштаб</span><input aria-label="Масштаб карты дерева" type="range" min="60" max="140" step="5" value={treeZoom} onChange={(event) => setTreeZoom(Number(event.target.value))} className="min-w-0 flex-1 accent-[oklch(var(--primary))]" /><span className="w-10 text-right font-mono text-xs text-muted-foreground">{treeZoom}%</span><button type="button" className="quiet-button rounded-lg px-2 py-1 text-xs" onClick={() => setTreeZoom(100)}>Сброс</button></div>}
          <div className={treeMode === "map" ? "surface overflow-auto rounded-xl p-3" : ""}>
            <div style={treeMode === "map" ? { width: treeZoom + "%", minWidth: "100%", transform: "scale(" + treeZoom / 100 + ")", transformOrigin: "top left", marginBottom: (treeZoom - 100) * 2 + "px" } : undefined}>
              <ul className={treeMode === "map" ? "min-w-max" : ""}>{roots.map((skill) => renderNode(skill.id))}</ul>
            </div>
          </div>
          {matchingIds && matchingIds.size === 0 && <p className="mt-3 text-sm text-muted-foreground">Совпадений нет. Попробуйте другое название.</p>}
        </> : <EmptyState title="Ветка ещё не выросла" text="Добавьте корневой навык, затем конкретные поднавыки. Ничего не записывается без вашего подтверждения." actionLabel="Добавить корневой навык" onAction={() => setSkillOpen(true)} />}
      </section>

      <DirectionModal open={directionOpen} onOpenChange={setDirectionOpen} name={name} setName={setName} description={description} setDescription={setDescription} onSubmit={submitDirection} />
      <Modal open={!!editingSkill} onOpenChange={(open) => !open && setEditingSkill(null)} title="Редактировать навык" description="Можно переименовать узел или перенести его в другую ветку.">
        <form onSubmit={(event) => { event.preventDefault(); if (editingSkill && editName.trim()) { updateSkill(editingSkill, { name: editName, parentId: editParentId || null }); setEditingSkill(null); } }} className="space-y-4 pt-2">
          <label className="block text-sm font-medium">Название<input className="field mt-1.5" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={120} /></label>
          <label className="block text-sm font-medium">Родительский узел<select className="field mt-1.5" value={editParentId} onChange={(event) => setEditParentId(event.target.value)}><option value="">Корневой навык</option>{directionSkills.filter((skill) => { if (skill.id === editingSkill) return false; let parent = skill.parentId; while (parent) { if (parent === editingSkill) return false; parent = directionSkills.find((item) => item.id === parent)?.parentId ?? null; } return true; }).map((skill) => <option key={skill.id} value={skill.id}>{skill.name}</option>)}</select></label>
          <button type="submit" className="press-button w-full rounded-xl px-4 text-sm font-semibold">Сохранить изменения</button>
        </form>
      </Modal>
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
