/**
 * Button component with variants (primary, secondary, ghost, destructive).
 * Built on Radix UI with Tailwind styling.
 * @remarks UI primitive.
 */

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/backend/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap font-medium transition-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 font-body",
    {
        variants: {
            variant: {
                // Primary - Brand colors
                primary: "bg-primary text-text-inverse border border-primary-dark hover:bg-primary-dark hover:shadow-md",
                secondary: "bg-secondary text-text-inverse border border-secondary-dark hover:bg-secondary-dark hover:shadow-md",
                
                // Enterprise Solid (Non-dashboard)
                solid: "bg-surface text-text-primary border border-border hover:border-primary hover:shadow-md",
                
                // Outlined Variants
                outline: "outlined-primary hover:bg-primary/10",
                "outline-secondary": "outlined-secondary hover:bg-secondary/10",
                
                // Subtle/Ghost
                ghost: "text-text-secondary hover:bg-surface hover:text-text-primary",
                
                // Status variants
                success: "bg-success text-text-inverse border border-success hover:opacity-90",
                warning: "bg-warning text-text-inverse border border-warning hover:opacity-90",
                danger: "bg-error text-text-inverse border border-error hover:opacity-90",
                
                // Link
                link: "text-primary underline-offset-4 hover:underline",
            },
            size: {
                sm: "h-8 px-3 text-sm rounded-[var(--radius-sm)]",
                md: "h-10 px-4 text-sm rounded-[var(--radius-md)]",
                lg: "h-12 px-6 text-base rounded-[var(--radius-md)]",
                xl: "h-14 px-8 text-lg rounded-[var(--radius-lg)]",
                icon: "h-10 w-10 rounded-[var(--radius-md)]",
            },
        },
        defaultVariants: {
            variant: "primary",
            size: "md",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, ...props }, ref) => {
        return (
            <button
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"

export { Button, buttonVariants }
