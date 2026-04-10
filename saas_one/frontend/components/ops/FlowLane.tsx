/**
 * FlowLane - SVG-based lane container representing a single state/team column in the ticket flow map.
 *
 * Renders as an SVG `<g>` group with a colored rounded rectangle background, a header bar,
 * a ticket-count badge, and an optional animated overload-warning indicator. The lane height
 * adapts dynamically based on the number of tickets it contains. Used within TicketFlowMap
 * to render columns for groups like Technical, Plumbing, and Housekeeping teams.
 *
 * @example
 * <FlowLane id="tech" label="Technical" color="#3b82f6" ticketCount={5} x={0} y={0} width={200} height={300}>
 *   {tickets.map(t => <TicketNode key={t.id} {...t} />)}
 * </FlowLane>
 */
'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface FlowLaneProps {
    id: string;
    label: string;
    color: string;
    ticketCount: number;
    children: ReactNode;
    x: number;
    y: number;
    width: number;
    height: number;
    isOverloaded?: boolean;
}

/**
 * Flow Lane - Container for tickets in a specific state/team
 * Adapts width based on ticket count
 */
export default function FlowLane({
    id,
    label,
    color,
    ticketCount,
    children,
    x,
    y,
    width,
    height,
    isOverloaded = false,
}: FlowLaneProps) {
    const baseHeight = height;
    const adaptiveHeight = Math.max(baseHeight, ticketCount * 50 + 80);

    return (
        <motion.g
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
        >
            {/* Lane background */}
            <rect
                x={x}
                y={y}
                width={width}
                height={adaptiveHeight}
                rx={16}
                ry={16}
                fill={`${color}15`}
                stroke={isOverloaded ? '#ef4444' : `${color}40`}
                strokeWidth={isOverloaded ? 3 : 2}
            />

            {/* Lane header */}
            <rect
                x={x}
                y={y}
                width={width}
                height={44}
                rx={16}
                ry={16}
                fill={color}
            />
            <rect
                x={x}
                y={y + 16}
                width={width}
                height={28}
                fill={color}
            />

            {/* Lane label */}
            <text
                x={x + width / 2}
                y={y + 26}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize={14}
                fontWeight={600}
            >
                {label}
            </text>

            {/* Ticket count badge */}
            <circle
                cx={x + width - 24}
                cy={y + 22}
                r={14}
                fill="#ffffff30"
            />
            <text
                x={x + width - 24}
                y={y + 22}
                textAnchor="middle"
                dominantBaseline="central"
                fill="#ffffff"
                fontSize={12}
                fontWeight={700}
            >
                {ticketCount}
            </text>

            {/* Overload warning indicator */}
            {isOverloaded && (
                <motion.circle
                    cx={x + 20}
                    cy={y + 22}
                    r={8}
                    fill="#ef4444"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                />
            )}

            {/* Ticket container area */}
            <g transform={`translate(${x + 20}, ${y + 60})`}>
                {children}
            </g>
        </motion.g>
    );
}
