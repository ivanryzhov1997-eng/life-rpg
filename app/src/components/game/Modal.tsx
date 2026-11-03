import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function Modal({ open, onOpenChange, title, description, children, wide = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[90dvh] overflow-y-auto border-border bg-popover p-5 text-popover-foreground sm:rounded-2xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}>
        <DialogHeader>
          <DialogTitle className="pr-6 text-xl tracking-[-0.03em]">{title}</DialogTitle>
          {description && <DialogDescription className="text-sm leading-relaxed text-muted-foreground">{description}</DialogDescription>}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
