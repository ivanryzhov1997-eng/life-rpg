import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Download, FileText, Moon, Sun, Upload, KeyRound, Merge } from "lucide-react";
import { toast } from "sonner";
import { gameStateSchema } from "@contracts/game";
import { useAuth } from "@/hooks/useAuth";
import { gameSnapshot, useGameStore } from "@/store/gameStore";
import { PageHeader } from "@/components/game/ui";
import { AiPanel } from "@/components/game/AiPanel";

export default function More() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth({ redirectPath: "/more" });
  const heroName = useGameStore((state) => state.hero.name);
  const settings = useGameStore((state) => state.settings);
  const setHeroName = useGameStore((state) => state.setHeroName);
  const setSettings = useGameStore((state) => state.setSettings);
  const importState = useGameStore((state) => state.importState);
  const [name, setName] = useState(heroName);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [recoveryInput, setRecoveryInput] = useState("");
  const [recovering, setRecovering] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setName(heroName), [heroName]);

  const exportData = () => {
    const data = JSON.stringify(gameSnapshot(useGameStore.getState()), null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `life-rpg-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Экспорт JSON готов");
  };

  const exportMarkdown = () => {
    const state = useGameStore.getState();
    const lines = ["# LIFE RPG — сохранение", "", `Герой: ${state.hero.name}`, `Уровень: ${state.hero.level} · ${state.hero.xp} XP`, `Завершено: ${state.hero.totalCompleted}`, "", "## Активные квесты", ...state.quests.filter((quest) => !quest.done).map((quest) => `- [ ] ${quest.title} (${quest.minutes} мин, ${quest.xp} XP)`), "", "## Завершённые квесты", ...state.quests.filter((quest) => quest.done).map((quest) => `- [x] ${quest.title}`), "", "## Цели", ...state.goals.map((goal) => `- ${goal.title}: ${goal.current}/${goal.target} ${goal.unit}`), "", "## Направления", ...state.directions.map((direction) => `- ${direction.name}: ${direction.xp} XP`), "", "## Журнал", ...state.lore.map((entry) => `- ${entry.createdAt.slice(0, 10)} — **${entry.title}**: ${entry.text}`)];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `life-rpg-${new Date().toISOString().slice(0, 10)}.md`; anchor.click(); URL.revokeObjectURL(url);
    toast.success("Экспорт Markdown готов");
  };

  const importData = async (file: File | undefined, mode: "replace" | "merge") => {
    if (!file) return;
    try {
      const parsed = gameStateSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error("invalid");
      importState(parsed.data);
      toast.success("Прогресс импортирован");
    } catch {
      toast.error("Файл не похож на сейв LIFE RPG текущей версии");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <PageHeader eyebrow="Система и настройки" title="Ещё" description="Профиль, тема, сейвы и наставник. Офлайн-ядро не зависит от подписки или ИИ." />

      <section className="mb-7 border-y border-border py-5" aria-labelledby="profile-title">
        <h2 id="profile-title" className="mb-4 text-lg font-semibold">Профиль</h2>
        <div className="flex gap-3">
          <label className="sr-only" htmlFor="hero-name">Имя героя</label>
          <input id="hero-name" className="field" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} />
          <button type="button" onClick={() => { setHeroName(name); toast.success("Имя сохранено"); }} className="quiet-button rounded-xl px-4 text-sm">Сохранить</button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{isAuthenticated ? `Аккаунт: ${user?.name ?? "Герой"}` : "Локальный профиль · без входа"}</span>
          <span className="text-xs text-muted-foreground">Анонимный аккаунт</span>
        </div>
      </section>

      <section className="surface mb-7 p-5" aria-labelledby="recovery-title">
        <h2 id="recovery-title" className="mb-2 text-lg font-semibold">Перенос прогресса</h2>
        <p className="mb-3 text-sm text-muted-foreground">Создайте код восстановления и сохраните его вне телефона. На новом устройстве введите этот код, чтобы загрузить облачный прогресс.</p>
        <button type="button" className="quiet-button inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm" onClick={async () => { try { const response = await fetch("/api/auth/recovery-code", { method: "POST", credentials: "include" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setRecoveryCode(data.code); } catch { toast.error("Не удалось создать код восстановления"); } }}><KeyRound size={16} />Создать код восстановления</button>
        {recoveryCode && <div className="mt-3 rounded-xl border border-border p-3"><code className="block break-all text-sm">{recoveryCode}</code><button type="button" className="mt-2 text-xs underline" onClick={() => { void navigator.clipboard.writeText(recoveryCode); toast.success("Код скопирован"); }}>Скопировать код</button><p className="mt-2 text-xs text-muted-foreground">Покажем его только сейчас. Сохраните код в надёжном месте.</p></div>}
        <div className="mt-5 border-t border-border pt-4"><label className="mb-2 block text-sm" htmlFor="recovery-code">Уже есть код? Восстановить аккаунт на этом устройстве</label><input id="recovery-code" className="field w-full" value={recoveryInput} onChange={(event) => setRecoveryInput(event.target.value)} placeholder="Код восстановления" /><button type="button" disabled={recovering || !recoveryInput.trim()} className="quiet-button mt-2 min-h-10 rounded-xl px-4 text-sm disabled:opacity-50" onClick={async () => { setRecovering(true); try { const response = await fetch("/api/auth/recover", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: recoveryInput }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); localStorage.setItem("life-rpg-force-cloud-restore", "1"); toast.success("Аккаунт восстановлен. Загружаем облачный прогресс."); window.location.reload(); } catch { toast.error("Код не найден или недействителен"); } finally { setRecovering(false); } }}>Восстановить</button></div>
      </section>

      <section className="mb-7" aria-labelledby="appearance-title">
        <h2 id="appearance-title" className="mb-3 text-lg font-semibold">Тема и пресет</h2>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setSettings({ theme: "dark" })} aria-pressed={settings.theme === "dark"} className={`quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm ${settings.theme === "dark" ? "border-foreground" : ""}`}><Moon size={16} aria-hidden="true" />Тёмная</button>
          <button type="button" onClick={() => setSettings({ theme: "light" })} aria-pressed={settings.theme === "light"} className={`quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm ${settings.theme === "light" ? "border-foreground" : ""}`}><Sun size={16} aria-hidden="true" />Светлая</button>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Акцент</span>
          {(["rose", "blue"] as const).map((preset) => <button key={preset} type="button" onClick={() => setSettings({ preset })} aria-pressed={settings.preset === preset} className={`min-h-11 rounded-full border px-4 text-sm ${settings.preset === preset ? "border-foreground" : "border-border text-muted-foreground"}`}>{preset === "rose" ? "Розовый" : "Синий"}</button>)}
        </div>
        <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={settings.confirmCriteria} onChange={(event) => setSettings({ confirmCriteria: event.target.checked })} className="h-5 w-5 accent-[oklch(var(--primary))]" />Подтверждать критерий перед начислением XP</label>
      </section>

      <section className="surface mb-7 p-5" aria-labelledby="ai-title">
        <h2 id="ai-title" className="mb-3 text-lg font-semibold">ИИ-наставник <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">PRO · DRAFT</span></h2>
        <AiPanel authenticated={isAuthenticated} />
      </section>

      <section className="mb-7 border-y border-border py-5" aria-labelledby="data-title">
        <h2 id="data-title" className="mb-2 text-lg font-semibold">Экспорт и импорт</h2>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">JSON включает квесты, привычки, дерево, цели и лор. Схема версионируется для миграций.</p>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={exportData} className="quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm"><Download size={16} aria-hidden="true" />JSON</button>
          <button type="button" onClick={exportMarkdown} className="quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm"><FileText size={16} aria-hidden="true" />Markdown</button>
          <button type="button" onClick={() => fileRef.current?.click()} className="quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm"><Upload size={16} aria-hidden="true" />Заменить</button>
          <button type="button" onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = "application/json,.json"; input.onchange = () => void importData(input.files?.[0], "merge"); input.click(); }} className="quiet-button inline-flex items-center justify-center gap-2 rounded-xl px-3 text-sm"><Merge size={16} aria-hidden="true" />Объединить</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importData(event.target.files?.[0], "replace")} />
        </div>
      </section>

      <section className="mb-7" aria-labelledby="plan-title">
        <h2 id="plan-title" className="mb-3 text-lg font-semibold">Модель монетизации · план</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="border-t border-foreground pt-3"><strong>Free</strong><p className="mt-1 text-muted-foreground">Ручные квесты, 1–2 направления, привычки, серия и локальный экспорт.</p></div>
          <div className="border-t border-border pt-3"><strong>Pro</strong><p className="mt-1 text-muted-foreground">ИИ, больше направлений, облако и аналитика. Офлайн-ядро не блокируется.</p></div>
        </div>
      </section>

      <button type="button" onClick={() => { setSettings({ onboardingSeen: false }); navigate("/"); }} className="quiet-button w-full rounded-xl px-4 text-sm">Показать онбординг ещё раз</button>
      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">PWA · локальная копия хранится в этом браузере. Без облачного входа очистка данных браузера удалит её.</p>
    </>
  );
}
