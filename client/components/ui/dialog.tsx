import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import { X } from "lucide-react";

type DialogContextValue = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

const DialogContext = createContext<DialogContextValue>({});

export function Dialog({ open, onOpenChange, children }: DialogContextValue & { children: ReactNode }) {
  return <DialogContext.Provider value={{ open, onOpenChange }}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({ children }: { asChild?: boolean; children: ReactNode }) {
  const ctx = useContext(DialogContext);
  return (
    <span onClick={() => ctx.onOpenChange?.(true)} className="inline-flex">
      {children}
    </span>
  );
}

export function DialogContent({ children }: { children: ReactNode }) {
  const ctx = useContext(DialogContext);
  if (!ctx.open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="relative w-full max-w-lg rounded-lg bg-white p-6 shadow-xl" onClick={(event) => event.stopPropagation()}>
        <button
          onClick={() => ctx.onOpenChange?.(false)}
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
        {children}
      </div>
    </div>
  );
}

export function DialogHeader({ children }: { children: ReactNode }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-slate-900">{children}</h2>;
}
