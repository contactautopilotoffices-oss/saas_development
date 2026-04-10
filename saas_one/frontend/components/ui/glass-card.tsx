/**
 * GlassCard
 * Frosted glass-style card with backdrop blur effect.
 * @remarks UI primitive.
 */

import { cn } from "@/backend/lib/utils";
import React from "react";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  intensity?: "low" | "medium" | "high";
}

export function GlassCard({ children, className, intensity = "medium", ...props }: GlassCardProps) {
  const intensityMap = {
    // Architectural: Darker, sharper, minimal border
    // Refined: More transparency, "Natural" feel
    low: "bg-white/5 border-white/5 backdrop-blur-sm",
    medium: "bg-slate-950/40 border-white/10 backdrop-blur-md",
    high: "bg-slate-950/60 border-white/10 backdrop-blur-lg",
  };

  return (
    <div
      className={cn(
        "shadow-2xl transition-all duration-300 rounded-sm border", // Sharp corners (rounded-sm)
        intensityMap[intensity],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
