import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { CloudOff, Goal, Menu, Network, ScrollText, UserRound } from "lucide-react";
import { useGameStore } from "@/store/gameStore";
import { useAuth } from "@/hooks/useAuth";
import { CloudSync } from "@/components/game/CloudSync";

const nav = [
  { to: "/", label: "Герой", icon: UserRound },
  { to: "/quests", label: "Квесты", icon: ScrollText },
  { to: "/skills", label: "Навыки", icon: Network },
  { to: "/goals", label: "Цели", icon: Goal },
  { to: "/more", label: "Ещё", icon: Menu },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const settings = useGameStore((state) => state.settings);
  const level = useGameStore((state) => state.hero.level);
  const rolloverHabits = useGameStore((state) => state.rolloverHabits);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", settings.theme === "dark");
    document.documentElement.dataset.preset = settings.preset;
    document.documentElement.style.colorScheme = settings.theme;
  }, [settings.theme, settings.preset]);

  useEffect(() => {
    rolloverHabits();
    const unsubscribeHydration = useGameStore.persist.onFinishHydration(() => rolloverHabits());
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onFocus = () => rolloverHabits();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    return () => {
      unsubscribeHydration();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
    };
  }, [rolloverHabits]);

  return (
    <div className="min-h-100dvh bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/95 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <NavLink to="/" aria-label="LIFE RPG — на экран героя" className="flex min-h-11 items-center gap-3">
            <span className="grid h-8 w-8 place-items-center rounded-full border border-foreground font-mono text-xs font-bold">L</span>
            <span className="font-mono text-xs font-semibold tracking-[0.18em]">LIFE / RPG</span>
          </NavLink>
          <div className="flex items-center gap-2">
            {!online && (
              <span className="flex min-h-8 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted-foreground">
                <CloudOff size={13} aria-hidden="true" /> Офлайн
              </span>
            )}
            <span className="rounded-full border border-border px-3 py-1 font-mono text-xs tabular-nums">LVL {level}</span>
          </div>
        </div>
      </header>

      <main className="content-safe mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">{children}</main>
      <div className="mx-auto w-full max-w-3xl px-4 pb-20 pt-3 sm:px-6"><CloudSync authenticated={isAuthenticated} /></div>

      <nav aria-label="Основная навигация" className="bottom-island fixed inset-x-0 bottom-0 z-40 bg-background/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-lg grid-cols-5 border-t border-border px-1 pt-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] transition-transform duration-150 active:scale-95 ${isActive ? "text-foreground" : "text-muted-foreground"}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 1.7} aria-hidden="true" />
                  <span>{label}</span>
                  {isActive && <span className="absolute bottom-0 h-0.5 w-5 rounded-full bg-primary" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
