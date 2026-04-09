/**
 * EnhancedClassificationBadge
 * UI indicator for AI-assisted ticket classification.
 * Displays only when ticket was classified with LLM assistance.
 * @remarks Client component.
 */

'use client';

import { Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';

interface EnhancedClassificationBadgeProps {
    /** Whether the ticket was classified with LLM assistance */
    enhanced?: boolean;
    /** Classification zone (A=rule, B=llm, C=human) */
    zone?: string;
    /** Subtle mode - only shows icon without text */
    subtle?: boolean;
}

/**
 * Subtle indicator for AI-enhanced classification
 * 
 * Per PRD: "No popups, no 'AI deciding your ticket' messaging, no blocking UI"
 * Shows only AFTER assignment, never during input
 */
export default function EnhancedClassificationBadge({
    enhanced = false,
    zone,
    subtle = true,
}: EnhancedClassificationBadgeProps) {
    if (!enhanced) return null;

    // Subtle mode: just an icon with tooltip
    if (subtle) {
        return (
            <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="inline-flex items-center gap-1 text-purple-400/70 cursor-help group relative"
                title="This ticket benefited from intelligent assistance"
            >
                <Sparkles className="w-3.5 h-3.5" />

                {/* Tooltip on hover */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#21262d] text-xs text-gray-300 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-[#30363d]">
                    Enhanced classification applied
                </span>
            </motion.span>
        );
    }

    // Non-subtle mode: label with icon
    return (
        <motion.span
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20"
            title="This ticket benefited from intelligent assistance"
        >
            <Sparkles className="w-3 h-3" />
            Enhanced classification
        </motion.span>
    );
}
