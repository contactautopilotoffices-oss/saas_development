/**
 * Theme Context — Dark/Light Mode Toggle
 *
 * Purpose: Manages the application's color theme (light vs dark mode) across
 * the entire component tree.
 *
 * How it works:
 *   - Reads the saved theme from localStorage on mount.
 *   - Falls back to 'light' theme (unified white experience) if nothing is saved.
 *   - Applies the theme by toggling the 'dark' class on the <html> element.
 *   - Persists the choice to localStorage so it survives page reloads.
 *
 * Usage:
 *   const { theme, toggleTheme } = useTheme();
 *
 * Tailwind integration:
 *   - When 'dark' class is on <html>, Tailwind's dark-mode: prefix activates.
 *   - All components should use dark: classes for dark mode styles.
 */

'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<Theme>('light');

    // Initialize theme from localStorage or system preference on first render
    useEffect(() => {
        const savedTheme = localStorage.getItem('theme') as Theme | null;
        if (savedTheme) {
            setTheme(savedTheme);
            document.documentElement.classList.toggle('dark', savedTheme === 'dark');
        } else {
            // Default to light for a unified white experience
            setTheme('light');
            document.documentElement.classList.remove('dark');
        }
    }, []);

    /**
     * Toggle between light and dark theme.
     *
     * What it does:
     *   1. Flip the theme state.
     *   2. Persist to localStorage so the choice survives page reload.
     *   3. Toggle the 'dark' class on <html> to activate Tailwind dark: styles.
     */
    const toggleTheme = () => {
        const newTheme = theme === 'light' ? 'dark' : 'light';
        setTheme(newTheme);
        localStorage.setItem('theme', newTheme);
        document.documentElement.classList.toggle('dark', newTheme === 'dark');
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
