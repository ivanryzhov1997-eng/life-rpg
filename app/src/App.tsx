import { lazy, Suspense, type ReactNode } from "react";
import { Routes, Route } from "react-router";
import { Toaster } from "sonner";
import NotFound from "./pages/NotFound";
import { AppShell } from "@/components/game/AppShell";

const Home = lazy(() => import("./pages/Home"));
const Quests = lazy(() => import("./pages/Quests"));
const Skills = lazy(() => import("./pages/Skills"));
const Goals = lazy(() => import("./pages/Goals"));
const More = lazy(() => import("./pages/More"));

function Screen({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

export default function App() {
  return (
    <>
      <Suspense fallback={<div className="grid min-h-100dvh place-items-center bg-background text-sm text-muted-foreground">Загружаем главу…</div>}>
        <Routes>
          <Route path="/" element={<Screen><Home /></Screen>} />
          <Route path="/quests" element={<Screen><Quests /></Screen>} />
          <Route path="/skills" element={<Screen><Skills /></Screen>} />
          <Route path="/goals" element={<Screen><Goals /></Screen>} />
          <Route path="/more" element={<Screen><More /></Screen>} />
          <Route path="*" element={<Screen><NotFound /></Screen>} />
        </Routes>
      </Suspense>
      <Toaster position="top-center" richColors closeButton toastOptions={{ className: "font-sans" }} />
    </>
  );
}
