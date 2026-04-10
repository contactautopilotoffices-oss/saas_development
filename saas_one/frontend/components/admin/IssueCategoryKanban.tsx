/**
 * IssueCategoryKanban - Drag-and-drop Kanban board for managing issue categories and their
 * skill-group assignments.
 *
 * Displays issue categories organized into four columns (Technical, Plumbing, Vendor,
 * Soft Services) with color-coded headers. Admins can drag category cards between columns
 * to reassign their skill group — the change is persisted to the database via
 * `/api/admin/issue-config`. Clicking a category expands it to reveal its mapped keywords.
 * New keywords can be added via `/api/admin/issue-config/keywords`. A setup banner
 * with one-click seeding is shown when the configuration tables are empty.
 *
 * @example
 * <IssueCategoryKanban />
 */
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    GripVertical, Plus, X, Trash2, Edit3, Save, ChevronDown, ChevronRight,
    Loader2, AlertCircle, CheckCircle2, Search, Tag, Zap, Droplet, Building2, Sparkles, RefreshCcw
} from 'lucide-react';

interface SkillGroup {
    id: string;
    code: string;
    name: string;
    description?: string;
}

interface IssueKeyword {
    id: string;
    keyword: string;
    match_type: 'exact' | 'contains' | 'regex';
}

interface IssueCategory {
    id: string;
    code: string;
    name: string;
    skill_group_id: string | null;
    priority: number;
    is_active: boolean;
    issue_keywords: IssueKeyword[];
}

interface Toast {
    message: string;
    type: 'success' | 'error';
}

const skillGroupIcons: Record<string, React.ReactNode> = {
    technical: <Zap className="w-4 h-4" />,
    plumbing: <Droplet className="w-4 h-4" />,
    vendor: <Building2 className="w-4 h-4" />,
    soft_services: <Sparkles className="w-4 h-4" />,
};

const skillGroupColors: Record<string, string> = {
    technical: 'bg-blue-500/10 border-blue-500/20 text-blue-600',
    plumbing: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-600',
    vendor: 'bg-amber-500/10 border-amber-500/20 text-amber-600',
    soft_services: 'bg-purple-500/10 border-purple-500/20 text-purple-600',
};

export default function IssueCategoryKanban() {
    const [skillGroups, setSkillGroups] = useState<SkillGroup[]>([]);
    const [categories, setCategories] = useState<IssueCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [needsSetup, setNeedsSetup] = useState(false);
    const [isSeeding, setIsSeeding] = useState(false);
    const [toast, setToast] = useState<Toast | null>(null);
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [draggedCategory, setDraggedCategory] = useState<string | null>(null);
    const [editingKeywords, setEditingKeywords] = useState<string | null>(null);
    const [newKeyword, setNewKeyword] = useState('');

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/admin/issue-config');
            const data = await res.json();

            if (data.error) {
                showToast(data.error, 'error');
                return;
            }

            setSkillGroups(data.skill_groups || []);
            setCategories(data.categories || []);
            setNeedsSetup(data.needs_setup || false);
        } catch (error) {
            showToast('Failed to fetch configuration', 'error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSeedDatabase = async () => {
        setIsSeeding(true);
        try {
            const res = await fetch('/api/admin/issue-config/seed', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                showToast(`Seeded: ${data.results.categories_created} categories, ${data.results.keywords_created} keywords`, 'success');
                fetchData();
            } else {
                showToast(data.error || 'Seeding failed', 'error');
            }
        } catch (error) {
            showToast('Seeding failed', 'error');
        } finally {
            setIsSeeding(false);
        }
    };

    const handleDragStart = (categoryId: string) => {
        setDraggedCategory(categoryId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (skillGroupId: string) => {
        if (!draggedCategory) return;

        const category = categories.find(c => c.id === draggedCategory);
        if (!category || category.skill_group_id === skillGroupId) {
            setDraggedCategory(null);
            return;
        }

        // Optimistic update
        setCategories(prev => prev.map(c =>
            c.id === draggedCategory ? { ...c, skill_group_id: skillGroupId } : c
        ));

        try {
            const res = await fetch('/api/admin/issue-config', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: draggedCategory, skill_group_id: skillGroupId })
            });

            const data = await res.json();
            if (!data.success) {
                showToast(data.error || 'Update failed', 'error');
                fetchData(); // Revert
            } else {
                showToast(`Moved "${category.name}" to new skill group`, 'success');
            }
        } catch (error) {
            showToast('Update failed', 'error');
            fetchData();
        }

        setDraggedCategory(null);
    };

    const handleAddKeyword = async (categoryId: string) => {
        if (!newKeyword.trim()) return;

        try {
            const res = await fetch('/api/admin/issue-config/keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    issue_category_id: categoryId,
                    keywords: [newKeyword.trim()]
                })
            });

            const data = await res.json();
            if (data.success) {
                showToast('Keyword added', 'success');
                setNewKeyword('');
                fetchData();
            } else {
                showToast(data.error || 'Failed to add keyword', 'error');
            }
        } catch (error) {
            showToast('Failed to add keyword', 'error');
        }
    };

    const handleDeleteKeyword = async (keywordId: string) => {
        try {
            const res = await fetch(`/api/admin/issue-config/keywords?id=${keywordId}`, {
                method: 'DELETE'
            });

            const data = await res.json();
            if (data.success) {
                showToast('Keyword removed', 'success');
                fetchData();
            } else {
                showToast(data.error || 'Failed to remove keyword', 'error');
            }
        } catch (error) {
            showToast('Failed to remove keyword', 'error');
        }
    };

    const getCategoriesForSkillGroup = (skillGroupId: string) => {
        return categories.filter(c => {
            const matchesGroup = c.skill_group_id === skillGroupId;
            const matchesSearch = !searchQuery ||
                c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.issue_keywords?.some(k => k.keyword.includes(searchQuery.toLowerCase()));
            return matchesGroup && matchesSearch;
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-96">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Toast */}
            {toast && (
                <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                    }`}>
                    {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                    {toast.message}
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-text-primary">Issue Categorization Board</h2>
                    <p className="text-sm text-text-tertiary mt-1">
                        Drag categories between columns to reassign skill groups. Click to manage keywords.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-tertiary" />
                        <input
                            type="text"
                            placeholder="Search categories or keywords..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-surface-elevated border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 w-64"
                        />
                    </div>
                    <button
                        onClick={fetchData}
                        className="p-2 bg-surface-elevated border border-border rounded-lg hover:bg-muted transition-colors"
                        title="Refresh"
                    >
                        <RefreshCcw className="w-4 h-4 text-text-secondary" />
                    </button>
                </div>
            </div>

            {/* Setup Banner */}
            {needsSetup && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500" />
                        <div>
                            <p className="font-semibold text-amber-800">Database Setup Required</p>
                            <p className="text-sm text-amber-600">
                                The issue configuration tables need to be seeded with data from the existing dictionary.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleSeedDatabase}
                        disabled={isSeeding}
                        className="px-4 py-2 bg-amber-500 text-white font-bold rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        {isSeeding ? 'Seeding...' : 'Seed Database'}
                    </button>
                </div>
            )}

            {/* Kanban Board */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {skillGroups.map(sg => (
                    <div
                        key={sg.id}
                        className="bg-surface-elevated border border-border rounded-xl overflow-hidden"
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(sg.id)}
                    >
                        {/* Column Header */}
                        <div className={`px-4 py-3 border-b border-border ${skillGroupColors[sg.code] || 'bg-slate-100'}`}>
                            <div className="flex items-center gap-2">
                                {skillGroupIcons[sg.code] || <Tag className="w-4 h-4" />}
                                <h3 className="font-bold text-sm">{sg.name}</h3>
                                <span className="ml-auto text-xs bg-white/50 px-2 py-0.5 rounded-full font-medium">
                                    {getCategoriesForSkillGroup(sg.id).length}
                                </span>
                            </div>
                        </div>

                        {/* Cards */}
                        <div className="p-2 space-y-2 min-h-[200px] max-h-[500px] overflow-y-auto">
                            {getCategoriesForSkillGroup(sg.id).map(category => (
                                <div
                                    key={category.id}
                                    draggable
                                    onDragStart={() => handleDragStart(category.id)}
                                    className={`bg-white border border-border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${draggedCategory === category.id ? 'opacity-50 scale-95' : ''
                                        }`}
                                >
                                    {/* Card Header */}
                                    <div className="flex items-start gap-2">
                                        <GripVertical className="w-4 h-4 text-text-tertiary mt-0.5 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <button
                                                onClick={() => setExpandedCategory(
                                                    expandedCategory === category.id ? null : category.id
                                                )}
                                                className="flex items-center gap-1 w-full text-left"
                                            >
                                                {expandedCategory === category.id ?
                                                    <ChevronDown className="w-3 h-3 text-text-tertiary" /> :
                                                    <ChevronRight className="w-3 h-3 text-text-tertiary" />
                                                }
                                                <span className="font-semibold text-sm text-text-primary truncate">
                                                    {category.name}
                                                </span>
                                            </button>
                                            <p className="text-[10px] text-text-tertiary mt-0.5 font-mono">
                                                {category.code}
                                            </p>
                                        </div>
                                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold shrink-0">
                                            {category.issue_keywords?.length || 0} keywords
                                        </span>
                                    </div>

                                    {/* Expanded Keywords Section */}
                                    {expandedCategory === category.id && (
                                        <div className="mt-3 pt-3 border-t border-border">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-text-secondary">Keywords</span>
                                                    <button 
                                                        onClick={() => setEditingKeywords(editingKeywords === category.id ? null : category.id)}
                                                        className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded uppercase font-black tracking-tighter hover:bg-primary/20 transition-colors"
                                                    >
                                                        {editingKeywords === category.id ? 'Close' : 'Manage'}
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Keyword Addition UI */}
                                            {editingKeywords === category.id && (
                                                <div className="flex items-center gap-2 mb-3 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                                    <input 
                                                        type="text"
                                                        placeholder="New keyword..."
                                                        value={newKeyword}
                                                        onChange={(e) => setNewKeyword(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddKeyword(category.id)}
                                                        className="flex-1 text-xs bg-white border border-border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/30"
                                                    />
                                                    <button 
                                                        onClick={() => handleAddKeyword(category.id)}
                                                        className="p-1 bg-primary text-white rounded hover:bg-primary-hover transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}

                                            {/* Keyword Tags */}
                                            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                                                {category.issue_keywords?.map(kw => (
                                                    <span
                                                        key={kw.id}
                                                        className="inline-flex items-center gap-1 text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded group hover:bg-slate-200 transition-colors"
                                                    >
                                                        {kw.keyword}
                                                        {editingKeywords === category.id && (
                                                            <button 
                                                                onClick={() => handleDeleteKeyword(kw.id)}
                                                                className="hover:text-red-500 ml-0.5 pointer-events-auto"
                                                            >
                                                                <X className="w-2.5 h-2.5" />
                                                            </button>
                                                        )}
                                                    </span>
                                                ))}
                                                {(!category.issue_keywords || category.issue_keywords.length === 0) && (
                                                    <span className="text-[10px] text-text-tertiary italic">No keywords mapped in code</span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {getCategoriesForSkillGroup(sg.id).length === 0 && (
                                <div className="text-center py-8 text-text-tertiary text-xs">
                                    No categories
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Info Footer */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-sm text-blue-700">
                    <strong>How it works:</strong> Drag a category card to a different column to reassign its Skill Group (stored in DB).
                    Keywords are persisted in the database and affect how the system routes tickets matching those keywords.
                </p>
            </div>
        </div>
    );
}
