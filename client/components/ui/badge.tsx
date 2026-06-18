import type { HTMLAttributes } from "react";
import { cn } from "./utils";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "outline" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold text-white",
        className,
      )}
      {...props}
    />
  );
}
