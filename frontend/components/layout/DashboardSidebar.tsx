'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import {
    LayoutDashboard, Users, Ticket, Package, Settings, LogOut,
    Menu, X, GitMerge, Calendar
} from 'lucide-react';
import CapabilityWrapper from '../auth/CapabilityWrapper';
import { useAuth } from '@/frontend/context/AuthContext';
import SignOutModal from '../ui/SignOutModal';
import ThemeToggle from '../ui/ThemeToggle';
import { motion, AnimatePresence } from 'framer-motion';

interface DashboardSidebarProps {
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

export default function DashboardSidebar({ isMobileOpen, onMobileClose }: DashboardSidebarProps) {
    const pathname = usePathname();
    const params = useParams();
    const orgId = params.orgId as string;
    const { signOut, user } = useAuth();
    const [showSignOutModal, setShowSignOutModal] = React.useState(false);

    const NAV_ITEMS = [
        { label: 'Overview', href: `/${orgId}/dashboard`, icon: LayoutDashboard, domain: 'dashboards' as const },
        { label: 'Tickets', href: `/${orgId}/tickets`, icon: Ticket, domain: 'tickets' as const },
        { label: 'Flow Map', href: `/${orgId}/flow-map`, icon: GitMerge, domain: 'tickets' as const },
        { label: 'Inventory', href: `/${orgId}/procurement`, icon: Package, domain: 'procurement' as const },
        { label: 'Staff', href: `/${orgId}/users`, icon: Users, domain: 'users' as const },
    ];

    const getUserInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U';
    };

    // Close sidebar when clicking a link on mobile
    const handleLinkClick = () => {
        if (isMobileOpen && onMobileClose) {
            onMobileClose();
        }
    };

    return (
        <>
            {/* Mobile Overlay */}
            <AnimatePresence>
                {isMobileOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={onMobileClose}
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`
                fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
                ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
                flex flex-col inset-y-0 overflow-hidden
            `}>
                {/* Mobile Close Button */}
                <button
                    onClick={onMobileClose}
                    className="lg:hidden absolute top-4 right-4 p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors z-50 border border-slate-200"
                >
                    <X className="w-5 h-5" />
                </button>

                <div className="p-6 pb-2">
                    <div className="flex flex-col items-center gap-2 mb-2">
                        <img src="/autopilot-logo-new.png" alt="Logo" className="h-10 w-auto object-contain" />
                        <div className="px-3 py-1 bg-primary/5 rounded-full border border-primary/10">
                            <p className="text-[10px] text-primary font-black uppercase tracking-[0.2em]">Staff Dashboard</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-3 space-y-1 overflow-y-auto custom-scrollbar touch-scroll min-h-0">
                    <p className="px-3 text-[10px] font-medium text-text-tertiary tracking-wider mb-3 font-body">
                        Management
                    </p>
                    {NAV_ITEMS.map((item) => (
                        <CapabilityWrapper key={item.href} domain={item.domain} action="view">
                            <Link
                                href={item.href}
                                onClick={handleLinkClick}
                                className={`
                                    flex items-center gap-3 px-3 py-3 lg:py-2.5 rounded-[var(--radius-md)] transition-smooth group
                                    ${pathname === item.href
                                        ? 'bg-primary text-text-inverse shadow-sm'
                                        : 'text-text-secondary hover:bg-surface-elevated hover:text-text-primary'
                                    }
                                `}
                            >
                                <item.icon className={`w-5 h-5 transition-smooth group-hover:scale-105 shrink-0`} />
                                <span className="font-body font-medium text-sm">{item.label}</span>
                            </Link>
                        </CapabilityWrapper>
                    ))}
                </nav>

                {/* Bottom Section */}
                <div className="p-4 pb-12 mt-auto space-y-3 border-t border-border flex-shrink-0 bg-white">
                    {/* User Profile */}
                    {user?.user_metadata?.role !== 'org_super_admin' && (
                        <div className="px-3 py-3 rounded-[var(--radius-lg)] border border-border/5">
                            <div className="flex items-center gap-3">
                                {user?.user_metadata?.user_photo_url || user?.user_metadata?.avatar_url ? (
                                    <img
                                        src={user.user_metadata.user_photo_url || user.user_metadata.avatar_url}
                                        alt="Profile"
                                        className="w-10 h-10 rounded-full object-cover border border-border shrink-0"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-bold text-sm shrink-0">
                                        {getUserInitials(user?.email || 'User')}
                                    </div>
                                )}
                                <div className="flex flex-col flex-1 min-w-0">
                                    <span className="text-xs font-semibold text-text-primary font-body truncate">
                                        {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                                    </span>
                                    <span className="text-[10px] text-text-tertiary font-body font-medium">
                                        {user?.user_metadata?.role || 'User'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="space-y-1">
                        <div className="flex items-center gap-2">
                            <Link
                                href={`/${orgId}/settings`}
                                onClick={handleLinkClick}
                                className="flex-1 flex items-center gap-2 px-3 py-2.5 lg:py-2 rounded-[var(--radius-md)] text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-smooth"
                            >
                                <Settings className="w-4 h-4 shrink-0" />
                                <span className="text-xs font-semibold font-body">Settings</span>
                            </Link>
                            <ThemeToggle />
                        </div>

                        <button
                            onClick={() => setShowSignOutModal(true)}
                            className="w-full flex items-center gap-2 px-3 py-2.5 lg:py-2 rounded-[var(--radius-md)] text-error hover:bg-error/10 transition-smooth"
                        >
                            <LogOut className="w-4 h-4 shrink-0" />
                            <span className="text-xs font-semibold font-body">Logout</span>
                        </button>
                    </div>

                    <SignOutModal
                        isOpen={showSignOutModal}
                        onClose={() => setShowSignOutModal(false)}
                        onConfirm={signOut}
                    />
                </div>
            </aside >
        </>
    );
}

// Mobile Header with Menu Toggle
export function MobileHeader({ onMenuToggle }: { onMenuToggle: () => void }) {
    return (
        <div className="mobile-header lg:hidden">
            <button
                onClick={onMenuToggle}
                className="mobile-menu-toggle"
                aria-label="Open menu"
            >
                <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                    <svg viewBox="0 0 32 40" fill="currentColor" className="h-4 text-white">
                        <path d="M0 40 L16 0 L32 40 L24 40 L16 16 L8 40 Z" />
                    </svg>
                </div>
                <span className="font-display font-semibold text-sm text-text-primary">
                    Autopilot
                </span>
            </div>

            <div className="w-11" /> {/* Spacer for centering */}
        </div>
    );
}
