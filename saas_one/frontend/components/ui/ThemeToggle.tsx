/**
 * ThemeToggle
 * Dark/light mode toggle button.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/frontend/context/ThemeContext';
import { motion } from 'framer-motion';

export default function ThemeToggle() {
    const { theme, toggleTheme } = useTheme();

    return (
        <motion.button
            onClick={toggleTheme}
            className="w-10 h-10 rounded-[var(--radius-md)] border border-border bg-surface hover:bg-surface-elevated transition-smooth flex items-center justify-center"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            aria-label="Toggle theme"
        >
            {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-secondary" />
            ) : (
                <Moon className="w-5 h-5 text-primary" />
            )}
        </motion.button>
    );
}
