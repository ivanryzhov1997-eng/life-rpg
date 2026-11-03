import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { QUEST_TYPE_LABELS, type QuestType } from "@contracts/game";

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const percent = Math.min(100, Math.max(0, value));
  return (
    <div className="progress-track" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
      <div className="progress-fill" style={{ transform: `scaleX(${percent / 100})` }} />
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <p className="game-label mb-2">{eyebrow}</p>}
        <h1 className="text-[2rem] font-semibold leading-[1.08] tracking-[-0.045em]">{title}</h1>
        {description && <p className="mt-2 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function TypeBadge({ type }: { type: QuestType }) {
  return (
    <span className={`quest-badge quest-${type.toLowerCase()}`}>
      {QUEST_TYPE_LABELS[type]}
    </span>
  );
}

export function EmptyState({ title, text, actionLabel, onAction }: { title: string; text: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="border-y border-border py-8 text-left">
      <p className="text-lg font-medium">{title}</p>
      <p className="mt-1 max-w-[55ch] text-sm text-muted-foreground">{text}</p>
      <button type="button" onClick={onAction} className="quiet-button mt-5 inline-flex items-center gap-2 rounded-xl px-4 text-sm font-medium">
        {actionLabel}<ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

export function SectionHeading({ title, meta, action }: { title: string; meta?: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.025em]">{title}</h2>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      {action}
    </div>
  );
}
