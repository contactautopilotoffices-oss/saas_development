/**
 * DashboardHeader — Top-of-page Dashboard Title Block
 *
 * A presentational page header component that renders the page title, optional subtitle,
 * optional icon, optional property label, and optional action buttons in a consistent
 * animated layout. It is purely presentational and does not manage any global state.
 *
 * KEY PROPS:
 *   - title:       string — the main heading text (rendered in display font, bold)
 *   - subtitle?:   string — optional descriptive text beneath the title
 *   - icon?:       LucideIcon — optional icon rendered in a colored container to the left
 *   - actions?:    React.ReactNode — optional action buttons rendered on the right side
 *   - propertyLabel?: string — optional small uppercase label (e.g. "Property A") above the title
 *
 * KEY STATE: None — the component is fully controlled via props.
 *
 * INTEGRATION:
 *   - Used at the top of almost every dashboard view page (tickets, flow-map, users, etc.)
 *   - The icon and actions props allow page-specific CTAs (e.g. "Create Ticket", "Export") to be injected
 *   - Wraps its content in a framer-motion div with a subtle fade + slide-up entrance animation
 *
 * UI/UX PATTERNS:
 *   - Stacks vertically: icon + property label + title + subtitle on the left, actions on the right
 *   - Icon is rendered in a rounded square with a primary-color tinted background
 *   - Entrance animation: opacity 0->1, y: -10->0 over 300ms with a custom ease curve
 *   - Fully responsive; actions wrap below the title on narrow screens via flex layout
 */
'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

interface DashboardHeaderProps {
    title: string;
    subtitle?: string;
    icon?: LucideIcon;
    actions?: React.ReactNode;
    propertyLabel?: string;
}

export default function DashboardHeader({ title, subtitle, icon: Icon, actions, propertyLabel }: DashboardHeaderProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0.0, 0.2, 1] }}
            className="mb-8"
        >
            <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                    {Icon && (
                        <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-primary/10 flex items-center justify-center shrink-0">
                            <Icon className="w-7 h-7 text-primary" />
                        </div>
                    )}
                    <div>
                        {propertyLabel && (
                            <p className="text-primary text-[11px] font-bold uppercase tracking-widest mb-1">
                                {propertyLabel}
                            </p>
                        )}
                        <h1 className="text-2xl sm:text-3xl font-display font-bold text-text-primary mb-1">
                            {title}
                        </h1>
                        {subtitle && (
                            <p className="text-text-secondary font-body">
                                {subtitle}
                            </p>
                        )}
                    </div>
                </div>
                {actions && (
                    <div className="flex items-center gap-2">
                        {actions}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
