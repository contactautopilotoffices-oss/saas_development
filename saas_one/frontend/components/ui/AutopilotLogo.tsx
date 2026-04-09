/**
 * AutopilotLogo
 * Brand logo component for the application.
 * @remarks Client component.
 */

import React from 'react';
import { cn } from '@/backend/lib/utils';

interface AutopilotLogoProps {
    className?: string;
    size?: 'sm' | 'md' | 'lg';
    variant?: 'light' | 'dark';
}

/**
 * Autopilot Logo Component
 * Features the distinctive triangle A with UTOPILOT text
 */
export const AutopilotLogo: React.FC<AutopilotLogoProps> = ({
    className,
    size = 'md',
    variant = 'dark'
}) => {
    const sizeClasses = {
        sm: 'h-6',
        md: 'h-8',
        lg: 'h-12'
    };

    const colorClasses = {
        dark: 'text-black',
        light: 'text-white'
    };

    return (
        <svg
            viewBox="0 0 200 40"
            fill="currentColor"
            className={cn(sizeClasses[size], colorClasses[variant], className)}
            aria-label="Autopilot Logo"
        >
            {/* Triangle A - Clean geometric design */}
            <path d="M0 40 L16 0 L32 40 L24 40 L16 16 L8 40 Z" />
            {/* UTOPILOT text */}
            <text
                x="38"
                y="32"
                fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
                fontSize="32"
                fontWeight="400"
                letterSpacing="-0.02em"
            >
                UTOPILOT
            </text>
        </svg>
    );
};

/**
 * Logo Icon Only (for small spaces, favicon style)
 */
export const AutopilotIcon: React.FC<{ className?: string; variant?: 'light' | 'dark' }> = ({
    className,
    variant = 'dark'
}) => {
    const colorClasses = {
        dark: 'text-black',
        light: 'text-white'
    };

    return (
        <svg
            viewBox="0 0 32 40"
            fill="currentColor"
            className={cn('h-8', colorClasses[variant], className)}
            aria-label="Autopilot"
        >
            {/* Triangle A only */}
            <path d="M0 40 L16 0 L32 40 L24 40 L16 16 L8 40 Z" />
        </svg>
    );
};

export default AutopilotLogo;
