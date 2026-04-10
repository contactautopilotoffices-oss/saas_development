/**
 * Skeleton
 * Loading placeholder with animated shimmer effect.
 * @remarks UI primitive.
 */

'use client';

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

interface SkeletonProps {
    className?: string;
}

export default function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "animate-pulse rounded-md bg-[#e3e3e3]",
                className
            )}
        />
    );
}
