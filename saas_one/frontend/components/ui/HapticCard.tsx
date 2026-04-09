/**
 * HapticCard
 * Animated card with subtle press feedback effect.
 * @remarks UI primitive.
 */

'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// Constants
const DWELL_DURATION_MS = 2000;
const DWELL_INDICATOR_DURATION = 2; // seconds for CSS animation

interface HapticCardProps {
    id: string;
    isExpanded: boolean;
    onActivate: (id: string | null) => void;
    baseContent: React.ReactNode;
    expandedContent?: React.ReactNode;
    className?: string;
    reducedMotion?: boolean;
}

/**
 * HapticCard - Apple-style intent-based hover card
 * 
 * Features:
 * - 2-second dwell timer before activation
 * - Visual dwell progress indicator
 * - Smooth expansion with grid reflow
 * - Respects prefers-reduced-motion
 */
export const HapticCard: React.FC<HapticCardProps> = ({
    id,
    isExpanded,
    onActivate,
    baseContent,
    expandedContent,
    className = '',
    reducedMotion = false,
}) => {
    const [isDwelling, setIsDwelling] = useState(false);
    const [dwellProgress, setDwellProgress] = useState(0);
    const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
    const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

    const clearTimers = useCallback(() => {
        if (dwellTimerRef.current) {
            clearTimeout(dwellTimerRef.current);
            dwellTimerRef.current = null;
        }
        if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
            progressIntervalRef.current = null;
        }
    }, []);

    const handleMouseEnter = useCallback(() => {
        if (isExpanded) return; // Already expanded, no need to start dwell

        setIsDwelling(true);
        setDwellProgress(0);

        // Progress indicator update (every 50ms)
        const startTime = Date.now();
        progressIntervalRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min((elapsed / DWELL_DURATION_MS) * 100, 100);
            setDwellProgress(progress);
        }, 50);

        // Activation timer
        dwellTimerRef.current = setTimeout(() => {
            clearTimers();
            setIsDwelling(false);
            onActivate(id);
        }, DWELL_DURATION_MS);
    }, [id, isExpanded, onActivate, clearTimers]);

    const handleMouseLeave = useCallback(() => {
        clearTimers();
        setIsDwelling(false);
        setDwellProgress(0);

        // If expanded and leaving, collapse
        if (isExpanded) {
            onActivate(null);
        }
    }, [isExpanded, onActivate, clearTimers]);

    // Cleanup on unmount
    useEffect(() => {
        return () => clearTimers();
    }, [clearTimers]);

    // Animation variants
    const cardVariants = {
        collapsed: {
            scale: 1,
            boxShadow: '0 1px 3px 0 rgb(0 0 0 / 0.1)',
            zIndex: 1,
        },
        expanded: {
            scale: 1.02,
            boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)',
            zIndex: 10,
        },
    };

    const contentVariants = {
        hidden: { opacity: 0, height: 0 },
        visible: { opacity: 1, height: 'auto' },
    };

    return (
        <motion.div
            className={`
                relative overflow-hidden rounded-3xl border border-slate-100 bg-white
                transition-all ease-out
                ${isExpanded ? 'col-span-2' : 'col-span-1'}
                ${!isExpanded && isDwelling ? 'ring-2 ring-slate-200 ring-offset-2' : ''}
                ${className}
            `}
            variants={reducedMotion ? undefined : cardVariants}
            initial="collapsed"
            animate={isExpanded ? 'expanded' : 'collapsed'}
            transition={{ duration: reducedMotion ? 0 : 0.5, ease: [0.32, 0.72, 0, 1] }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Dwell Progress Indicator */}
            {isDwelling && !reducedMotion && (
                <motion.div
                    className="absolute top-0 left-0 h-1 bg-gradient-to-r from-slate-300 to-slate-400 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${dwellProgress}%` }}
                    transition={{ duration: 0.05, ease: 'linear' }}
                />
            )}

            {/* Base Content */}
            <div className="p-6 lg:p-8">
                {baseContent}
            </div>

            {/* Expanded Analytics Content */}
            <AnimatePresence>
                {isExpanded && expandedContent && (
                    <motion.div
                        className="px-6 lg:px-8 pb-6 lg:pb-8 border-t border-slate-50"
                        variants={reducedMotion ? undefined : contentVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={{ duration: reducedMotion ? 0 : 0.3, ease: 'easeOut' }}
                    >
                        <div>{expandedContent}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

/**
 * HapticCardGrid - Container that manages card expansion state
 * 
 * Automatically handles:
 * - Single card expansion (only one at a time)
 * - Grid reflow when a card expands
 * - Sibling de-emphasis
 */
interface HapticCardGridProps {
    children: React.ReactNode;
    className?: string;
    columns?: number;
}

export const HapticCardGrid: React.FC<HapticCardGridProps> = ({
    children,
    className = '',
    columns = 4,
}) => {
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [reducedMotion, setReducedMotion] = useState(false);

    // Detect prefers-reduced-motion
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setReducedMotion(mediaQuery.matches);

        const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    // Clone children and inject expansion props
    const enhancedChildren = React.Children.map(children, (child) => {
        if (React.isValidElement<HapticCardProps>(child) && child.type === HapticCard) {
            const isExpanded = child.props.id === expandedId;
            const isSibling = expandedId !== null && !isExpanded;

            return React.cloneElement(child, {
                isExpanded,
                onActivate: setExpandedId,
                reducedMotion,
                className: `${child.props.className || ''} ${isSibling ? 'opacity-60' : ''}`,
            });
        }
        return child;
    });

    return (
        <div
            className={`
                grid gap-6 transition-all duration-500 ease-out
                ${expandedId ? `grid-cols-1 md:grid-cols-${columns}` : `grid-cols-1 md:grid-cols-${columns}`}
                ${className}
            `}
            style={{
                gridTemplateColumns: expandedId
                    ? `repeat(${columns}, minmax(0, 1fr))`
                    : `repeat(${columns}, minmax(0, 1fr))`,
            }}
        >
            {enhancedChildren}
        </div>
    );
};

export default HapticCard;
