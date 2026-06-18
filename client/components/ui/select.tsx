import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { cn } from "./utils";

type Item = { value: string; label: ReactNode };
type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  items: Item[];
  registerItem: (item: Item) => void;
};

const SelectContext = createContext<SelectContextValue | null>(null);

export function Select({ value, onValueChange, children }: { value?: string; onValueChange?: (value: string) => void; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange,
        open,
        setOpen,
        items,
        registerItem: (item) => setItems((current) => current.some((existing) => existing.value === item.value) ? current : [...current, item]),
      }}
    >
      <div ref={containerRef} className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children }: { className?: string; children?: ReactNode }) {
  const ctx = useRequiredSelect();

  return (
    <button
      type="button"
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100",
        className,
      )}
      onClick={() => ctx.setOpen(!ctx.open)}
    >
      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{children}</span>
      <span className="text-slate-400 ml-2 text-xs">v</span>
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: ReactNode }) {
  const ctx = useRequiredSelect();
  const active = ctx.items.find((item) => item.value === ctx.value);
  return <>{active?.label ?? placeholder}</>;
}

export function SelectContent({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useRequiredSelect();

  return (
    <>
      <div className={cn("absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white p-1 shadow-lg", !ctx.open && "hidden", className)}>
        {children}
      </div>
    </>
  );
}

export function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useRequiredSelect();
  useEffect(() => {
    ctx.registerItem({ value, label: children });
  }, [value, children]);

  return (
    <button
      type="button"
      className={cn(
        "block w-full rounded px-3 py-2 text-left text-sm hover:bg-slate-100",
        ctx.value === value && "bg-sky-50 text-sky-700",
      )}
      onClick={() => {
        ctx.onValueChange?.(value);
        ctx.setOpen(false);
      }}
    >
      {children}
    </button>
  );
}

function useRequiredSelect() {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("Select components must be used inside Select");
  return ctx;
}
