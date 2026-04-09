/**
 * Input components (Input, Textarea).
 * Built on React Hook Form with Tailwind styling.
 * @remarks UI primitive.
 */

import * as React from "react"
import { cn } from "@/backend/lib/utils"

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        return (
            <input
                type={type}
                className={cn(
                    "flex h-10 w-full rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2 text-sm font-body text-text-primary transition-smooth",
                    "placeholder:text-text-tertiary",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-primary",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                    "hover:border-primary/50",
                    className
                )}
                ref={ref}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }
