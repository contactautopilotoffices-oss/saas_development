/**
 * Utility: Common helper functions used across the application.
 *
 * Purpose: Reusable, pure (stateless) helper functions that don't belong
 * in any specific module. Keeps other code DRY and readable.
 *
 * Current utilities:
 *   - cn(): Tailwind CSS class name merger (clsx + tailwind-merge)
 */

/**
 * Merge and deduplicate Tailwind CSS class names.
 *
 * What it does:
 *   - Takes any number of class value inputs (strings, objects, arrays).
 *   - Uses clsx to resolve conditional class names (e.g., { active: true }).
 *   - Uses tailwind-merge to resolve Tailwind conflicts (e.g., 'text-red text-blue'
 *     → only 'text-blue' remains, as Tailwind's last-class-wins rule).
 *
 * Why needed:
 *   - Next.js / React components often build class names conditionally.
 *   - Without deduplication, duplicate Tailwind classes bloat the HTML and cause
 *     unpredictable style overrides.
 *
 * @param inputs — Any combination of: strings, objects, arrays, undefined, null
 * @returns A single deduplicated Tailwind class string
 *
 * Usage:
 *   cn('px-4 py-2', isActive && 'bg-blue-500', { 'text-white': isActive })
 *   // → 'px-4 py-2 bg-blue-500 text-white' (deduplicated)
 */
import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    // clsx handles conditional logic, twMerge deduplicates Tailwind classes
    return twMerge(clsx(inputs))
}
