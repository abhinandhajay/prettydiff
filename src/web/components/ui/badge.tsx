import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const badgeVariants = cva(
    "inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 focus:ring-offset-background",
    {
        variants: {
            variant: {
                default: "border-primary/25 bg-primary/10 text-primary",
                secondary: "border-border/80 bg-secondary/45 text-secondary-foreground",
                destructive:
                    "border-destructive/25 bg-destructive/10 text-destructive dark:text-rose-300",
                outline: "border-border/80 bg-transparent text-muted-foreground",
                success:
                    "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                warning: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    },
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
    dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props}>
            {dot ? (
                <span
                    aria-hidden
                    className={cn(
                        "size-1.5 rounded-full",
                        variant === "success" && "bg-emerald-500 dark:bg-emerald-400",
                        variant === "destructive" && "bg-rose-500 dark:bg-rose-400",
                        variant === "warning" && "bg-amber-500 dark:bg-amber-400",
                        variant === "secondary" && "bg-muted-foreground/70",
                        variant === "outline" && "bg-muted-foreground/70",
                        (!variant || variant === "default") && "bg-primary",
                    )}
                />
            ) : null}
            {children}
        </div>
    );
}

export { Badge, badgeVariants };
