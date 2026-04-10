/**
 * TabNavigation
 * Renders a horizontal tab bar for dashboard sections.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';
import { motion } from 'framer-motion';

export interface Tab {
    id: string;
    label: string;
    icon?: LucideIcon;
    badge?: number;
}

interface TabNavigationProps {
    tabs: Tab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
}

export default function TabNavigation({ tabs, activeTab, onTabChange }: TabNavigationProps) {
    return (
        <div className="mb-8">
            <div className="enterprise-card p-1 inline-flex gap-1">
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    
                    return (
                        <motion.button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`
                                relative px-4 py-2.5 rounded-[var(--radius-md)] font-semibold text-sm font-body
                                flex items-center gap-2 transition-smooth
                                ${isActive 
                                    ? 'bg-primary text-text-inverse shadow-sm' 
                                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                                }
                            `}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            {Icon && <Icon className="w-4 h-4" />}
                            <span>{tab.label}</span>
                            {tab.badge !== undefined && tab.badge > 0 && (
                                <span className={`
                                    text-xs font-bold px-1.5 py-0.5 rounded-full
                                    ${isActive 
                                        ? 'bg-text-inverse/20 text-text-inverse' 
                                        : 'bg-primary/10 text-primary'
                                    }
                                `}>
                                    {tab.badge}
                                </span>
                            )}
                        </motion.button>
                    );
                })}
            </div>
        </div>
    );
}
