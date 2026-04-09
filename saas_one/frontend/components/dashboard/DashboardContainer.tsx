/**
 * DashboardContainer
 * Full-screen layout wrapper for dashboard pages with sidebar navigation.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface DashboardContainerProps {
    children: React.ReactNode;
    className?: string;
}

export default function DashboardContainer({ children, className = '' }: DashboardContainerProps) {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
            className={`min-h-screen bg-background p-6 lg:p-8 ${className}`}
        >
            <div className="max-w-[1600px] mx-auto">
                {children}
            </div>
        </motion.div>
    );
}
