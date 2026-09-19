import * as React from "react";
import { Plus } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const fabVariants = cva(
  "fixed z-40 inline-flex items-center justify-center rounded-full shadow-lg transition-all hover:shadow-xl active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        md: "h-12 w-12",
        lg: "h-14 w-14",
      },
      position: {
        "bottom-right": "bottom-6 right-6",
        "bottom-left": "bottom-6 left-6",
        "bottom-center": "bottom-6 left-1/2 -translate-x-1/2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "lg",
      position: "bottom-right",
    },
  },
);

export interface FabProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof fabVariants> {
  icon?: React.ReactNode;
  label?: string;
}

export const FloatingActionButton = React.forwardRef<HTMLButtonElement, FabProps>(
  ({ className, variant, size, position, icon, label, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        aria-label={label ?? "Ação"}
        className={cn(fabVariants({ variant, size, position }), className)}
        {...props}
      >
        {icon ?? children ?? <Plus className="h-5 w-5" />}
      </button>
    );
  },
);
FloatingActionButton.displayName = "FloatingActionButton";
