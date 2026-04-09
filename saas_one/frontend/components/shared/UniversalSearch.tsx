/**
 * UniversalSearch
 * Global search component across tickets, users, properties, and vendors.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { addRecentItem, getRecentItems, addRecentSearch, getRecentSearches, type RecentItem } from '@/frontend/utils/searchHistory';
import { 
    Search, 
    Ticket, 
    User, 
    Building, 
    X, 
    Command,
    Loader2,
    ArrowRight,
    SearchX,
    Building2,
    LayoutDashboard,
    GitMerge,
    Package,
    Users,
    FileBarChart,
    Fuel,
    Zap,
    Wrench,
    Calendar,
    Handshake,
    ClipboardCheck,
    Settings
} from 'lucide-react';

interface SearchResult {
    id: string;
    type: 'ticket' | 'user' | 'property' | 'organization' | 'module';
    label: string;
    sublabel?: string;
    route?: string;
    icon?: any;
    organization_id?: string;
}

const MODULES = [
    { id: 'm-dash', label: 'Dashboard', sublabel: 'Overview & Statistics', route: '/dashboard', type: 'module' as const, keywords: ['overview', 'stats', 'home'], icon: LayoutDashboard },
    { id: 'm-tick', label: 'Tickets', sublabel: 'Manage requests & issues', route: '/dashboard?tab=requests', type: 'module' as const, keywords: ['requests', 'complaints', 'issues'], icon: Ticket },
    { id: 'm-flow', label: 'Flow Map', sublabel: 'Ticket lifecycle visualizer', route: '/flow-map', type: 'module' as const, keywords: ['process', 'topology', 'link'], icon: GitMerge },
    { id: 'm-inv', label: 'Inventory', sublabel: 'Stock & procurement', route: '/dashboard?tab=stock_reports', type: 'module' as const, keywords: ['stock', 'items', 'warehouse'], icon: Package },
    { id: 'm-user', label: 'Staff & Users', sublabel: 'Manage team members', route: '/dashboard?tab=users', type: 'module' as const, keywords: ['people', 'employees', 'directory'], icon: Users },
    { id: 'm-prop', label: 'Properties', sublabel: 'Building management', route: '/dashboard?tab=properties', type: 'module' as const, keywords: ['buildings', 'sites', 'locations'], icon: Building2 },
    { id: 'm-repo', label: 'Reports', sublabel: 'Analytics & exports', route: '/dashboard?tab=reports', type: 'module' as const, keywords: ['stats', 'export', 'data'], icon: FileBarChart },
    { id: 'm-dies', label: 'Diesel', sublabel: 'Fuel tracking & logs', route: '/dashboard?tab=diesel', type: 'module' as const, keywords: ['fuel', 'generator', 'dg'], icon: Fuel },
    { id: 'm-elec', label: 'Electricity', sublabel: 'Energy consumption', route: '/dashboard?tab=electricity', type: 'module' as const, keywords: ['power', 'meters', 'utility'], icon: Zap },
    { id: 'm-ppm', label: 'PPM', sublabel: 'Preventative maintenance', route: '/dashboard?tab=ppm', type: 'module' as const, keywords: ['maintenance', 'schedule', 'periodic'], icon: Wrench },
    { id: 'm-room', label: 'Meeting Rooms', sublabel: 'Booking & management', route: '/dashboard?tab=rooms', type: 'module' as const, keywords: ['booking', 'calendar', 'office'], icon: Calendar },
    { id: 'm-vend', label: 'Vendors', sublabel: 'Partner management', route: '/dashboard?tab=vendors', type: 'module' as const, keywords: ['suppliers', 'partners', 'external'], icon: Handshake },
    { id: 'm-che', label: 'Checklist', sublabel: 'Daily inspections', route: '/dashboard?tab=checklist', type: 'module' as const, keywords: ['inspections', 'audit', 'daily'], icon: ClipboardCheck },
    { id: 'm-sett', label: 'Settings', sublabel: 'System configuration', route: '/dashboard?tab=settings', type: 'module' as const, keywords: ['config', 'profile', 'admin'], icon: Settings }
];

export function UniversalSearch() {
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [recentItems, setRecentItems] = useState<RecentItem[]>([]);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const router = useRouter();
    const params = useParams();
    const orgId = params?.orgId as string;

    // Pre-compute org-scoped modules once (instant, no network)
    const scopedModules = useMemo(() => 
        MODULES.map(m => ({
            ...m,
            route: orgId ? `/${orgId}${m.route}` : m.route
        })),
        [orgId]
    );

    // Global shortcut listener (Cmd+K or Ctrl+K)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setIsOpen(true);
            }
            if (e.key === 'Escape') {
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Load recent items from localStorage when modal opens
    useEffect(() => {
        if (isOpen) {
            setRecentItems(getRecentItems());
            setRecentSearches(getRecentSearches());
            setTimeout(() => inputRef.current?.focus(), 100);
        } else {
            setQuery('');
            setResults([]);
        }
    }, [isOpen]);

    // Instant local filter + debounced DB search
    useEffect(() => {
        // Cancel any in-flight request
        if (abortRef.current) {
            abortRef.current.abort();
            abortRef.current = null;
        }

        if (!query || query.length < 1) {
            setResults([]);
            setIsLoading(false);
            return;
        }

        // Layer 1: Instant module filter (0ms, no network)
        const q = query.toLowerCase();
        const filteredModules: SearchResult[] = scopedModules.filter(m =>
            m.label.toLowerCase().includes(q) ||
            m.sublabel.toLowerCase().includes(q) ||
            m.keywords.some(k => k.includes(q))
        );

        // Layer 2: Instant recent items filter (0ms, from localStorage)
        const filteredRecent: SearchResult[] = recentItems
            .filter(r =>
                r.label.toLowerCase().includes(q) ||
                (r.sublabel?.toLowerCase().includes(q))
            )
            .map(r => ({ ...r, icon: undefined }));

        // Show instant results immediately
        setResults([...filteredModules, ...filteredRecent]);
        setSelectedIndex(0);

        // Layer 3: DB search (debounced, background)
        if (query.length >= 2) {
            setIsLoading(true);
            const controller = new AbortController();
            abortRef.current = controller;

            const timer = setTimeout(async () => {
                try {
                    const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
                        signal: controller.signal
                    });
                    const data = await response.json();
                    const dbResults: SearchResult[] = data.results || [];

                    // Merge: modules first, then recent, then fresh DB results (deduped)
                    const existingIds = new Set([...filteredModules, ...filteredRecent].map(r => r.id));
                    const newDbResults = dbResults.filter(r => !existingIds.has(r.id));
                    setResults([...filteredModules, ...filteredRecent, ...newDbResults]);
                    setSelectedIndex(0);
                } catch (error: any) {
                    if (error?.name !== 'AbortError') {
                        console.error('Search error:', error);
                    }
                } finally {
                    setIsLoading(false);
                }
            }, 150);

            return () => {
                clearTimeout(timer);
                controller.abort();
            };
        }
    }, [query, orgId, scopedModules, recentItems]);

    const handleSelect = useCallback((item: SearchResult) => {
        setIsOpen(false);

        // Save to recent items for instant future access
        let route = '';
        if (item.type === 'module' && item.route) {
            route = item.route;
        } else if (item.type === 'ticket') {
            route = `/tickets/${item.id}`;
        } else if (item.type === 'property') {
            route = `/property/${item.id}/dashboard`;
        } else if (item.type === 'user') {
            route = `/users/${item.id}`;
        } else if (item.type === 'organization') {
            route = `/org/${item.id}/dashboard`;
        }

        addRecentItem({
            id: item.id,
            type: item.type,
            label: item.label,
            sublabel: item.sublabel,
            route
        });

        if (query.length >= 2) {
            addRecentSearch(query);
        }

        if (route) router.push(route);
    }, [router, query]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
        } else if (e.key === 'Enter' && results.length > 0) {
            handleSelect(results[selectedIndex]);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'ticket': return <Ticket className="w-4 h-4" />;
            case 'user': return <User className="w-4 h-4" />;
            case 'property': return <Building2 className="w-4 h-4" />;
            case 'organization': return <Building className="w-4 h-4" />;
            default: return <Search className="w-4 h-4" />;
        }
    };

    return (
        <>
            {/* Search Trigger Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-secondary bg-muted hover:bg-muted-hover border border-border rounded-lg transition-smooth w-full min-w-[160px] max-w-[320px] group shadow-sm hover:shadow-md"
            >
                <Search className="w-4 h-4 group-hover:text-primary transition-colors" />
                <span className="flex-1 text-left">Search anything...</span>
                <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px] text-text-tertiary">
                    <Command className="w-3 h-3" />
                    <span>K</span>
                </div>
            </button>

            {/* Search Modal Overlay */}
            <AnimatePresence>
                {isOpen && (
                    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            className="relative w-full max-w-2xl mx-4 bg-surface rounded-2xl border border-border shadow-2xl overflow-hidden glass-morphism"
                        >
                            {/* Search Header */}
                            <div className="relative border-b border-border p-4 flex items-center gap-3">
                                <Search className="w-5 h-5 text-text-tertiary" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    placeholder="Type to search (tickets, properties, users...)"
                                    className="flex-1 bg-transparent border-none outline-none text-text-primary placeholder:text-text-tertiary text-lg font-body"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                {isLoading ? (
                                    <Loader2 className="w-5 h-5 text-primary animate-spin" />
                                ) : (
                                    <button 
                                        onClick={() => setIsOpen(false)}
                                        className="p-1.5 hover:bg-muted rounded-full text-text-tertiary transition-smooth"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                )}
                            </div>

                            {/* Search Content */}
                            <div className="max-h-[60vh] overflow-y-auto overflow-x-hidden">
                                {query.length < 1 ? (
                                    <div className="p-2">
                                        {/* Recent Searches */}
                                        {recentSearches.length > 0 && (
                                            <div className="mb-3">
                                                <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-text-tertiary">Recent Searches</p>
                                                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                                                    {recentSearches.map((s, i) => (
                                                        <button
                                                            key={`rs-${i}`}
                                                            onClick={() => setQuery(s)}
                                                            className="px-2.5 py-1 rounded-lg text-xs bg-muted hover:bg-muted-hover text-text-secondary border border-border transition-smooth"
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Recent Items */}
                                        {recentItems.length > 0 && (
                                            <div className="mb-3">
                                                <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-text-tertiary">Recently Visited</p>
                                                <div className="space-y-0.5">
                                                    {recentItems.slice(0, 5).map((item, index) => (
                                                        <button
                                                            key={`ri-${item.id}`}
                                                            onClick={() => handleSelect(item as SearchResult)}
                                                            className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-smooth hover:bg-muted group"
                                                        >
                                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-muted text-text-tertiary group-hover:bg-primary/10 group-hover:text-primary transition-smooth">
                                                                {getIcon(item.type)}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-sm font-medium text-text-primary truncate">{item.label}</p>
                                                                {item.sublabel && <p className="text-xs text-text-tertiary truncate">{item.sublabel}</p>}
                                                            </div>
                                                            <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-muted text-text-tertiary border border-border">{item.type}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* All Modules — Always Visible */}
                                        <div>
                                            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-text-tertiary">Quick Navigation</p>
                                            <div className="grid grid-cols-2 gap-1">
                                                {scopedModules.map((m) => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => handleSelect(m as SearchResult)}
                                                        className="flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-smooth hover:bg-muted group"
                                                    >
                                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-muted text-text-tertiary group-hover:bg-primary/10 group-hover:text-primary transition-smooth">
                                                            <m.icon className="w-3.5 h-3.5" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-medium text-text-primary truncate">{m.label}</p>
                                                            <p className="text-[10px] text-text-tertiary truncate">{m.sublabel}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ) : results.length > 0 ? (
                                    <div className="p-2 space-y-1">
                                        {results.map((result, index) => (
                                            <button
                                                key={`${result.type}-${result.id}-${index}`}
                                                onClick={() => handleSelect(result)}
                                                onMouseEnter={() => setSelectedIndex(index)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-smooth group ${
                                                    selectedIndex === index ? 'bg-primary/10 border-primary/20 bg-muted/50 ring-1 ring-primary/20 shadow-sm' : 'hover:bg-muted border-transparent'
                                                }`}
                                            >
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-smooth ${
                                                    selectedIndex === index ? 'bg-primary text-white' : 'bg-muted text-text-tertiary group-hover:bg-background'
                                                }`}>
                                                    {result.type === 'module' && result.icon ? <result.icon className="w-4 h-4" /> : getIcon(result.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-semibold text-text-primary truncate">{result.label}</p>
                                                        <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-muted text-text-tertiary border border-border group-hover:bg-background">
                                                            {result.type}
                                                        </span>
                                                    </div>
                                                    {result.sublabel && (
                                                        <p className="text-xs text-text-tertiary truncate">{result.sublabel}</p>
                                                    )}
                                                </div>
                                                <ArrowRight className={`w-4 h-4 transition-smooth ${
                                                    selectedIndex === index ? 'text-primary opacity-100 translate-x-0' : 'text-text-tertiary opacity-0 -translate-x-4'
                                                }`} />
                                            </button>
                                        ))}
                                    </div>
                                ) : !isLoading && (
                                    <div className="p-12 text-center">
                                        <div className="w-12 h-12 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
                                            <SearchX className="w-6 h-6 text-text-tertiary" />
                                        </div>
                                        <h3 className="text-lg font-semibold text-text-primary">No matching results</h3>
                                        <p className="text-text-tertiary">We couldn't find anything matching "{query}"</p>
                                    </div>
                                )}
                            </div>
                            
                            {/* Search Footer */}
                            <div className="p-3 border-t border-border bg-muted/50 flex items-center justify-between text-[11px] text-text-tertiary font-body">
                                <div className="flex items-center gap-4">
                                    <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px] shadow-sm">↵</kbd> to select</span>
                                    <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px] shadow-sm">↑↓</kbd> to navigate</span>
                                </div>
                                <span className="flex items-center gap-1.5"><kbd className="px-1.5 py-0.5 rounded border border-border bg-background font-mono text-[10px] shadow-sm">ESC</kbd> to close</span>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
}
