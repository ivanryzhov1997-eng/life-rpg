import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { QUEST_TYPE_LABELS, xpForQuest, type QuestType } from "@contracts/game";
import { useGameStore } from "@/store/gameStore";
import { Modal } from "./Modal";

const types: QuestType[] = ["SIDE", "MAIN", "BOSS", "HABIT"];

export function QuestForm({ open, onOpenChange, defaultType = "SIDE" }: { open: boolean; onOpenChange: (open: boolean) => void; defaultType?: QuestType }) {
  const directions = useGameStore((state) => state.directions);
  const skills = useGameStore((state) => state.skills);
  const goals = useGameStore((state) => state.goals);
  const addQuest = useGameStore((state) => state.addQuest);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<QuestType>(defaultType);
  const [difficulty, setDifficulty] = useState(1);
  const [description, setDescription] = useState("");
  const [criteria, setCriteria] = useState("");
  const [minutes, setMinutes] = useState(15);
  const [directionId, setDirectionId] = useState(directions[0]?.id ?? "");
  const [skillId, setSkillId] = useState("");
  const [goalId, setGoalId] = useState("");
  const [goalUnits, setGoalUnits] = useState(1);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setDirectionId((current) => current || directions[0]?.id || "");
    }
  }, [open, defaultType, directions]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !criteria.trim() || !directionId) {
      toast.error("Заполните название, критерий и направление");
      return;
    }
    addQuest({
      title: title.trim(), type, difficulty, description: description.trim() || criteria.trim(),
      completionCriteria: criteria.trim(), minutes, directionId, skillId: skillId || null,
      goalId: goalId || null, goalUnits: goalId ? goalUnits : 0,
    });
    toast.success(type === "HABIT" ? "Привычка добавлена" : "Квест добавлен");
    setTitle(""); setDescription(""); setCriteria(""); setSkillId(""); setGoalId("");
    onOpenChange(false);
  };

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={type === "HABIT" ? "Новая привычка" : "Новый квест"} description="Сформулируйте результат так, чтобы его можно было честно проверить." wide>
      <form onSubmit={submit} className="grid gap-4 pt-2 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">Название
          <input autoFocus className="field mt-1.5" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={160} placeholder="Например, 20 минут черновика" required />
        </label>
        <label className="text-sm font-medium">Тип
          <select className="field mt-1.5" value={type} onChange={(event) => setType(event.target.value as QuestType)}>
            {types.map((item) => <option key={item} value={item}>{QUEST_TYPE_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Сложность · {xpForQuest(type, difficulty)} XP
          <select className="field mt-1.5" value={difficulty} onChange={(event) => setDifficulty(Number(event.target.value))}>
            {[1, 2, 3, 4, 5].map((item) => <option key={item} value={item}>{item} из 5</option>)}
          </select>
        </label>
        <label className="text-sm font-medium sm:col-span-2">Описание
          <textarea className="field mt-1.5" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} placeholder="Контекст и минимальный следующий шаг" />
        </label>
        <label className="text-sm font-medium sm:col-span-2">Измеримый критерий завершения
          <textarea className="field mt-1.5" value={criteria} onChange={(event) => setCriteria(event.target.value)} maxLength={500} placeholder="Что должно быть сделано, чтобы начислить XP?" required />
        </label>
        <label className="text-sm font-medium">Минут
          <input type="number" min={1} max={type === "HABIT" ? 60 : 480} className="field mt-1.5" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} required />
        </label>
        <label className="text-sm font-medium">Направление
          <select className="field mt-1.5" value={directionId} onChange={(event) => { setDirectionId(event.target.value); setSkillId(""); setGoalId(""); }} required>
            {directions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Навык
          <select className="field mt-1.5" value={skillId} onChange={(event) => setSkillId(event.target.value)}>
            <option value="">Только направление</option>
            {skills.filter((item) => item.directionId === directionId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Связанная цель
          <select className="field mt-1.5" value={goalId} onChange={(event) => setGoalId(event.target.value)}>
            <option value="">Без цели</option>
            {goals.filter((item) => !item.directionId || item.directionId === directionId).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        {goalId && <label className="text-sm font-medium sm:col-span-2">Прогресс цели за выполнение
          <input type="number" min={0.1} step={0.1} className="field mt-1.5" value={goalUnits} onChange={(event) => setGoalUnits(Number(event.target.value))} />
        </label>}
        <div className="flex gap-3 sm:col-span-2">
          <button type="button" onClick={() => onOpenChange(false)} className="quiet-button flex-1 rounded-xl px-4 text-sm">Отмена</button>
          <button type="submit" className="press-button flex-1 rounded-xl px-4 text-sm font-semibold">Добавить · {xpForQuest(type, difficulty)} XP</button>
        </div>
      </form>
    </Modal>
  );
}
