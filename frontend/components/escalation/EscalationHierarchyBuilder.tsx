'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Trash2, Save, Edit2, X, Check, Search, GripVertical,
  AlertTriangle, Bell, Mail, Smartphone, ChevronDown, ChevronRight,
  Users, Clock, ArrowRight, ToggleLeft, ToggleRight, Info,
  TrendingUp, Loader2, RefreshCw, Shield
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  department?: string;
  membership_role?: string;
  status: 'active' | 'inactive';
}

interface EscalationLevel {
  id?: string;
  level_number: number;
  employee_id: string | null;
  employee?: Employee | null;
  escalation_time_minutes: number;
  notification_channels: string[];
}

interface Hierarchy {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  is_default: boolean;
  trigger_after_minutes: number;
  property_id?: string | null;
  organization_id: string;
  created_at: string;
  levels: EscalationLevel[];
}

interface Props {
  organizationId: string;
  propertyId?: string;
  propertySelector?: React.ReactNode;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  push: <Smartphone className="w-3 h-3" />,
  email: <Mail className="w-3 h-3" />,
};

const NOTIFICATION_CHANNELS = ['push', 'email'];

const LEVEL_COLORS = [
  'from-blue-500 to-blue-600',
  'from-amber-500 to-amber-600',
  'from-orange-500 to-orange-600',
  'from-red-500 to-red-600',
  'from-rose-600 to-rose-700',
  'from-purple-600 to-purple-700',
];

function initLevel(levelNumber: number): EscalationLevel {
  return {
    level_number: levelNumber,
    employee_id: null,
    employee: null,
    escalation_time_minutes: 30,
    notification_channels: ['push', 'email'],
  };
}

function roleLabel(role?: string) {
  if (!role) return '';
  return role.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

// ─── Employee Pool Card ───────────────────────────────────────────────────────

function EmployeeCard({
  employee,
  onDragStart,
  inLevel,
}: {
  employee: Employee;
  onDragStart?: (e: React.DragEvent, emp: Employee) => void;
  inLevel?: boolean;
}) {
  const initials = employee.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart ? (e) => onDragStart(e, employee) : undefined}
      className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all select-none
        ${inLevel
          ? 'bg-white border-slate-200 shadow-sm'
          : 'bg-white border-slate-100 shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/30 hover:shadow-md'
        }`}
    >
      {!inLevel && <GripVertical className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center text-white text-xs font-black flex-shrink-0 shadow-sm">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-black text-slate-800 truncate">{employee.full_name}</p>
        {inLevel ? (
          <>
            <p className="text-[10px] text-slate-400 font-medium truncate">{employee.email}</p>
            {employee.membership_role && (
              <p className="text-[10px] text-primary/70 font-semibold truncate">{roleLabel(employee.membership_role)}</p>
            )}
          </>
        ) : (
          <p className="text-[10px] text-slate-400 font-medium truncate">{employee.department || roleLabel(employee.membership_role) || employee.email}</p>
        )}
      </div>
    </div>
  );
}

// ─── Level Card ────────────────────────────────────────────────────────────────

function LevelCard({
  level,
  levelIndex,
  onDrop,
  onDragOver,
  onDragLeave,
  onRemoveEmployee,
  onRemoveLevel,
  onUpdateTime,
  onToggleChannel,
  isDragOver,
  canRemove,
}: {
  level: EscalationLevel;
  levelIndex: number;
  onDrop: (e: React.DragEvent, levelIndex: number) => void;
  onDragOver: (e: React.DragEvent, levelIndex: number) => void;
  onDragLeave: () => void;
  onRemoveEmployee: (levelIndex: number) => void;
  onRemoveLevel: (levelIndex: number) => void;
  onUpdateTime: (levelIndex: number, minutes: number) => void;
  onToggleChannel: (levelIndex: number, channel: string) => void;
  isDragOver: boolean;
  canRemove: boolean;
}) {
  const colorClass = LEVEL_COLORS[levelIndex % LEVEL_COLORS.length];
  const levelName = `Escalation Level ${levelIndex + 1}`;
  // Local string state lets the user clear and retype freely; commit on blur
  const [timeInput, setTimeInput] = React.useState(String(level.escalation_time_minutes));
  React.useEffect(() => { setTimeInput(String(level.escalation_time_minutes)); }, [level.escalation_time_minutes]);

  return (
    <div className="w-full sm:w-[260px] flex-shrink-0 flex flex-col bg-white rounded-2xl border border-slate-200 shadow-sm transition-all duration-200 overflow-hidden relative">
      {/* Level Header */}
      <div className={`bg-gradient-to-r ${colorClass} px-3 py-2.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-black">
            {level.level_number}
          </div>
          <span className="text-white text-xs font-black uppercase tracking-wider">{levelName}</span>
        </div>
        {canRemove && (
          <button
            onClick={() => onRemoveLevel(levelIndex)}
            className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center text-white transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div
        onDrop={(e) => onDrop(e, levelIndex)}
        onDragOver={(e) => onDragOver(e, levelIndex)}
        onDragLeave={onDragLeave}
        className={`flex-1 p-3 flex flex-col gap-4 ${isDragOver ? 'bg-primary/5 border-primary ring-inset ring-2 ring-primary/20' : 'bg-slate-50/50'}`}
      >
        {/* Drop zone: Employee slot */}
        <div className="relative group min-h-[70px] flex items-center justify-center">
          {level.employee ? (
            <div className="w-full relative group">
              <EmployeeCard employee={level.employee} inLevel />
              <button
                onClick={() => onRemoveEmployee(levelIndex)}
                className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity shadow z-10"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <div className={`w-full h-full min-h-[70px] flex items-center justify-center py-3 rounded-xl border-2 border-dashed ${isDragOver ? 'border-primary bg-primary/10' : 'border-slate-300 bg-white'}`}>
              <Users className={`w-5 h-5 mr-2 ${isDragOver ? 'text-primary' : 'text-slate-300'}`} />
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Drop Employee</p>
            </div>
          )}
        </div>

        {/* Time Settings */}
        <div className="pt-2 border-t border-slate-200">
          <label className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            <Clock className="w-3 h-3" /> Escalate After
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={10080}
              value={timeInput}
              onChange={e => setTimeInput(e.target.value)}
              onBlur={() => {
                const v = Math.max(1, parseInt(timeInput) || 1);
                setTimeInput(String(v));
                onUpdateTime(levelIndex, v);
              }}
              className="w-16 px-2 py-1.5 text-xs font-black border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-center"
            />
            <span className="text-xs font-bold text-slate-500">mins</span>
          </div>
        </div>

        {/* Channels Settings */}
        <div className="pt-2 border-t border-slate-200">
          <label className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
            <Bell className="w-3 h-3" /> Notify via
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {NOTIFICATION_CHANNELS.map(ch => (
              <button
                key={ch}
                onClick={() => onToggleChannel(levelIndex, ch)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black border transition-all
                  ${level.notification_channels.includes(ch)
                    ? 'bg-primary text-white border-primary shadow-sm'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                {CHANNEL_ICONS[ch]}
                <span>{ch}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hierarchy Card (list view) ───────────────────────────────────────────────

function HierarchyCard({
  hierarchy,
  onEdit,
  onDelete,
  onToggleActive,
}: {
  hierarchy: Hierarchy;
  onEdit: (h: Hierarchy) => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white border border-slate-100 rounded-2xl shadow-sm overflow-hidden"
    >
      <div className="flex items-center justify-between p-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${hierarchy.is_active ? 'bg-green-400' : 'bg-slate-300'}`} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-black text-sm text-slate-800 truncate">{hierarchy.name}</h3>
              {hierarchy.is_default && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded-full flex-shrink-0">Default</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              {hierarchy.description && (
                <p className="text-[11px] text-slate-400 font-medium truncate">{hierarchy.description}</p>
              )}
              <span className="text-[10px] text-amber-600 font-bold flex items-center gap-1 flex-shrink-0">
                <Clock className="w-3 h-3" />{hierarchy.trigger_after_minutes ?? 30}m trigger
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-[10px] font-black uppercase tracking-widest text-slate-400 border border-slate-100 rounded-lg px-2 py-1">
            {hierarchy.levels.length} level{hierarchy.levels.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => onToggleActive(hierarchy.id, !hierarchy.is_active)}
            className={`transition-colors ${hierarchy.is_active ? 'text-green-500 hover:text-green-600' : 'text-slate-300 hover:text-slate-400'}`}
            title={hierarchy.is_active ? 'Disable' : 'Enable'}
          >
            {hierarchy.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
          </button>
          <button
            onClick={() => onEdit(hierarchy)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-primary transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(hierarchy.id)}
            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-slate-100 overflow-hidden"
          >
            <div className="p-4 flex gap-2 flex-wrap">
              {hierarchy.levels.map((lvl, i) => (
                <React.Fragment key={lvl.id || i}>
                  <div className="flex flex-col items-center gap-1.5">
                    <div className={`bg-gradient-to-r ${LEVEL_COLORS[i % LEVEL_COLORS.length]} text-white text-[10px] font-black px-2 py-0.5 rounded-t-lg`}>
                      L{lvl.level_number}
                    </div>
                    <div className="border border-slate-100 rounded-b-lg rounded-tr-lg p-2.5 text-center min-w-[90px] bg-slate-50">
                      <p className="text-xs font-black text-slate-700">{lvl.employee?.full_name || 'Unassigned'}</p>
                      <p className="text-[9px] text-slate-400 font-medium mt-0.5">{lvl.escalation_time_minutes} min</p>
                    </div>
                  </div>
                  {i < hierarchy.levels.length - 1 && (
                    <div className="flex items-center self-center mt-3">
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function EscalationHierarchyBuilder({ organizationId, propertyId, propertySelector }: Props) {
  const [hierarchies, setHierarchies] = useState<Hierarchy[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingHierarchy, setEditingHierarchy] = useState<Hierarchy | null>(null);
  const [hierarchyName, setHierarchyName] = useState('');
  const [hierarchyDesc, setHierarchyDesc] = useState('');
  const [triggerAfterMinutes, setTriggerAfterMinutes] = useState(30);
  const [isDefault, setIsDefault] = useState(false);
  const [levels, setLevels] = useState<EscalationLevel[]>([initLevel(1)]);

  // Employee pool state
  const [poolSearch, setPoolSearch] = useState('');
  const [dragOverLevel, setDragOverLevel] = useState<number | null>(null);
  const dragEmployee = useRef<Employee | null>(null);
  const autoScrollRef = useRef<number | null>(null);

  function stopAutoScroll() {
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = null; }
  }

  // ── Fetch data ──────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ organizationId });
      if (propertyId) params.set('propertyId', propertyId);

      const [hierRes, empRes] = await Promise.all([
        fetch(`/api/escalation/hierarchies?${params}`),
        fetch(`/api/escalation/employees?${params}`),
      ]);

      if (!hierRes.ok || !empRes.ok) throw new Error('Failed to fetch data');

      const [hier, emp] = await Promise.all([hierRes.json(), empRes.json()]);
      setHierarchies(Array.isArray(hier) ? hier : []);
      setEmployees(Array.isArray(emp) ? emp : []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Pool filter ─────────────────────────────────────────────────────────────

  const filteredEmployees = employees.filter(e =>
    !poolSearch ||
    e.full_name.toLowerCase().includes(poolSearch.toLowerCase()) ||
    e.email.toLowerCase().includes(poolSearch.toLowerCase()) ||
    (e.department || '').toLowerCase().includes(poolSearch.toLowerCase())
  );

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, emp: Employee) {
    dragEmployee.current = emp;
    e.dataTransfer.effectAllowed = 'copy';

    // Global dragover fires anywhere on the page — auto-scroll based on cursor Y
    const onGlobalDragOver = (ev: DragEvent) => {
      ev.preventDefault();
      const ZONE = 160;
      const SPEED = 30;
      if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current);
      const y = ev.clientY;
      const vh = window.innerHeight;
      if (y < ZONE) {
        const step = () => { window.scrollBy(0, -SPEED); autoScrollRef.current = requestAnimationFrame(step); };
        autoScrollRef.current = requestAnimationFrame(step);
      } else if (y > vh - ZONE) {
        const step = () => { window.scrollBy(0, SPEED); autoScrollRef.current = requestAnimationFrame(step); };
        autoScrollRef.current = requestAnimationFrame(step);
      } else {
        stopAutoScroll();
      }
    };

    const onDragEnd = () => {
      stopAutoScroll();
      document.removeEventListener('dragover', onGlobalDragOver);
      document.removeEventListener('dragend', onDragEnd);
    };

    document.addEventListener('dragover', onGlobalDragOver);
    document.addEventListener('dragend', onDragEnd);
  }

  function handleDragOver(e: React.DragEvent, levelIndex: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverLevel(levelIndex);
  }

  function handleDragLeave() {
    setDragOverLevel(null);
  }

  function handleDrop(e: React.DragEvent, levelIndex: number) {
    e.preventDefault();
    stopAutoScroll();
    setDragOverLevel(null);
    const emp = dragEmployee.current;
    if (!emp) return;
    setLevels(prev => prev.map((lvl, i) =>
      i === levelIndex
        ? { ...lvl, employee_id: emp.id, employee: emp }
        : lvl
    ));
    dragEmployee.current = null;
  }

  // ── Level management ────────────────────────────────────────────────────────

  function addLevel() {
    if (levels.length >= 6) return;
    setLevels(prev => [...prev, initLevel(prev.length + 1)]);
  }

  function removeLevel(index: number) {
    if (levels.length <= 1) return;
    setLevels(prev => {
      const next = prev.filter((_, i) => i !== index);
      return next.map((lvl, i) => ({ ...lvl, level_number: i + 1 }));
    });
  }

  function removeEmployee(levelIndex: number) {
    setLevels(prev => prev.map((lvl, i) =>
      i === levelIndex ? { ...lvl, employee_id: null, employee: null } : lvl
    ));
  }

  function updateTime(levelIndex: number, minutes: number) {
    setLevels(prev => prev.map((lvl, i) =>
      i === levelIndex ? { ...lvl, escalation_time_minutes: minutes } : lvl
    ));
  }

  function toggleChannel(levelIndex: number, channel: string) {
    setLevels(prev => prev.map((lvl, i) => {
      if (i !== levelIndex) return lvl;
      const has = lvl.notification_channels.includes(channel);
      return {
        ...lvl,
        notification_channels: has
          ? lvl.notification_channels.filter(c => c !== channel)
          : [...lvl.notification_channels, channel],
      };
    }));
  }

  // ── Open builder ────────────────────────────────────────────────────────────

  function openCreate() {
    if (propertySelector !== undefined && !propertyId) {
      setError('Please select a property from the dropdown before creating a hierarchy.');
      return;
    }
    setError('');
    setEditingHierarchy(null);
    setHierarchyName('');
    setHierarchyDesc('');
    setTriggerAfterMinutes(30);
    setIsDefault(false);
    setLevels([initLevel(1)]);
    setShowBuilder(true);
  }

  function openEdit(h: Hierarchy) {
    setEditingHierarchy(h);
    setHierarchyName(h.name);
    setHierarchyDesc(h.description || '');
    setTriggerAfterMinutes(h.trigger_after_minutes ?? 30);
    setIsDefault(h.is_default ?? false);
    setLevels(
      h.levels.length > 0
        ? h.levels.map(lvl => {
          const empId = (lvl.employee as any)?.id ?? lvl.employee_id ?? null;
          const poolMatch = empId ? employees.find(e => e.id === empId) : null;
          return {
            ...lvl,
            employee_id: empId,
            employee: lvl.employee
              ? {
                  ...(lvl.employee as any),
                  status: 'active' as const,
                  membership_role: poolMatch?.membership_role ?? (lvl.employee as any).membership_role,
                }
              : null,
          };
        })
        : [initLevel(1)]
    );
    setShowBuilder(true);
  }

  function closeBuilder() {
    setShowBuilder(false);
    setEditingHierarchy(null);
    setError('');
  }

  // ── Save hierarchy ──────────────────────────────────────────────────────────

  async function saveHierarchy() {
    setError('');
    if (!hierarchyName.trim()) { setError('Hierarchy name is required.'); return; }
    const hasEmployee = levels.some(l => l.employee_id);
    if (!hasEmployee) { setError('Assign at least one employee to an escalation level.'); return; }

    setIsSaving(true);
    try {
      const payload = {
        organizationId,
        propertyId: propertyId || undefined,
        name: hierarchyName.trim(),
        description: hierarchyDesc.trim() || undefined,
        trigger_after_minutes: triggerAfterMinutes,
        is_default: isDefault,
        levels: levels.map((lvl, i) => ({
          level_number: i + 1,
          employee_id: lvl.employee_id,
          escalation_time_minutes: lvl.escalation_time_minutes,
          notification_channels: lvl.notification_channels,
        })),
      };

      const url = editingHierarchy
        ? `/api/escalation/hierarchies/${editingHierarchy.id}`
        : '/api/escalation/hierarchies';
      const method = editingHierarchy ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');

      setSuccess(editingHierarchy ? 'Hierarchy updated!' : 'Hierarchy created!');
      setTimeout(() => setSuccess(''), 3000);
      closeBuilder();
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────────────────────────

  async function deleteHierarchy(id: string) {
    if (!confirm('Delete this escalation hierarchy? This cannot be undone and will stop escalation for associated tickets.')) return;
    try {
      const res = await fetch(`/api/escalation/hierarchies/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setHierarchies(prev => prev.filter(h => h.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── Toggle active ───────────────────────────────────────────────────────────

  async function toggleActive(id: string, active: boolean) {
    try {
      const res = await fetch(`/api/escalation/hierarchies/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: active }),
      });
      if (!res.ok) throw new Error('Update failed');
      setHierarchies(prev => prev.map(h => h.id === id ? { ...h, is_active: active } : h));
    } catch (err: any) {
      setError(err.message);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // ── When builder is open, render as a full-page view inside the tab ──────────
  if (showBuilder) {
    return (
      <motion.div
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.15 }}
        className="space-y-6"
      >
        {/* Page header — same style as list header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={closeBuilder}
              className="flex items-center gap-1.5 text-sm font-black text-slate-400 hover:text-slate-700 transition-colors"
            >
              <X className="w-4 h-4" />
              Back
            </button>
            <div className="w-px h-5 bg-slate-200" />
            <div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {editingHierarchy ? 'Edit Escalation Hierarchy' : 'New Escalation Hierarchy'}
              </h2>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                Drag employees from the pool onto escalation levels
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={closeBuilder}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveHierarchy}
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save Hierarchy'}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-bold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Fields card */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Hierarchy Name *
              </label>
              <input
                type="text"
                value={hierarchyName}
                onChange={e => setHierarchyName(e.target.value)}
                placeholder="e.g. Default Escalation Chain"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                Description (optional)
              </label>
              <input
                type="text"
                value={hierarchyDesc}
                onChange={e => setHierarchyDesc(e.target.value)}
                placeholder="e.g. For all maintenance tickets"
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-1 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escalate if MST idle for</p>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={triggerAfterMinutes}
                    onChange={e => setTriggerAfterMinutes(e.target.value as any)}
                    onBlur={e => setTriggerAfterMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm font-black text-center focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                  />
                  <span className="text-xs text-slate-500 font-medium">minutes</span>
                </div>
              </div>
            </div>
            <div className="w-px h-10 bg-slate-100" />
            <button
              type="button"
              onClick={() => setIsDefault(v => !v)}
              className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all text-xs font-black ${
                isDefault
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300'
              }`}
            >
              {isDefault ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              Set as default for this property
            </button>
            {isDefault && (
              <p className="text-[10px] text-primary/70 font-medium">New tickets will auto-attach this hierarchy.</p>
            )}
          </div>
        </div>

        {/* Kanban area — full width, natural height, scrolls with the page */}
        <div className="flex gap-4 items-start">
          {/* Employee Pool — sticky on scroll */}
          <div className="flex-shrink-0 w-72 sticky top-4 max-h-[calc(100vh-6rem)] flex flex-col">
            <div className="bg-slate-800 rounded-t-2xl px-3 py-2.5 flex items-center gap-2 flex-shrink-0">
              <Users className="w-4 h-4 text-slate-300" />
              <span className="text-white text-xs font-black uppercase tracking-wider">Employee Pool</span>
            </div>
            <div className="border border-slate-200 border-t-0 rounded-b-2xl bg-slate-50/80 flex flex-col flex-1 min-h-0">
              <div className="p-2.5 border-b border-slate-100 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={poolSearch}
                    onChange={e => setPoolSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="p-2 space-y-1.5 flex-1 overflow-y-auto min-h-0">
                {filteredEmployees.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {employees.length === 0 ? 'No employees found' : 'No matches'}
                    </p>
                  </div>
                ) : (
                  filteredEmployees.map(emp => (
                    <EmployeeCard key={emp.id} employee={emp} onDragStart={handleDragStart} />
                  ))
                )}
              </div>
              <div className="p-2 border-t border-slate-100">
                <p className="text-[9px] text-slate-400 font-medium text-center">Drag employees to levels →</p>
              </div>
            </div>
          </div>

          {/* Escalation Levels — highest level on top, level 1 at bottom */}
          <div className="flex-1">
            {/* Top-right Add Level button */}
            {levels.length < 6 && (
              <div className="flex justify-end mb-4 max-w-2xl mx-auto">
                <button
                  onClick={addLevel}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl hover:bg-primary/90 transition-all shadow-sm"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Level
                  <span className="ml-1 opacity-70">({6 - levels.length} remaining)</span>
                </button>
              </div>
            )}
            <div className="flex flex-col items-center gap-6 max-w-2xl mx-auto pb-8">
              {[...levels].reverse().map((level, displayIndex) => {
                const originalIndex = levels.length - 1 - displayIndex;
                return (
                <React.Fragment key={originalIndex}>
                  <div className="w-full flex justify-center">
                    <LevelCard
                      level={level}
                      levelIndex={originalIndex}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onRemoveEmployee={removeEmployee}
                      onRemoveLevel={removeLevel}
                      onUpdateTime={updateTime}
                      onToggleChannel={toggleChannel}
                      isDragOver={dragOverLevel === originalIndex}
                      canRemove={levels.length > 1}
                    />
                  </div>
                  {displayIndex < levels.length - 1 && (
                    <div className="flex flex-col items-center">
                      <div className="w-px h-6 bg-slate-200" />
                      <div className="w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 shadow-sm">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                      <div className="w-px h-6 bg-slate-200" />
                    </div>
                  )}
                </React.Fragment>
                );
              })}


              {/* Bottom save bar */}
              <div className="w-full flex items-center justify-between pt-4 border-t border-slate-200 mt-2">
                <div className="flex items-center gap-2 text-xs text-slate-400 font-medium">
                  <Info className="w-3.5 h-3.5" />
                  Max 6 escalation levels. Unassigned levels are skipped.
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={closeBuilder} className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-black text-slate-600 hover:bg-slate-100 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveHierarchy}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-5 py-2 bg-primary text-white rounded-xl text-sm font-black hover:bg-primary/90 transition-colors disabled:opacity-60 shadow-sm"
                  >
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? 'Saving...' : 'Save Hierarchy'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight">Escalation Hierarchies</h2>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            Configure employee-based ticket escalation chains with timed triggers.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {propertySelector}
          <button
            onClick={fetchData}
            className="p-2 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-black shadow-sm hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Hierarchy
          </button>
        </div>
      </div>

      {/* Toast notifications */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm font-bold">
            <Check className="w-4 h-4" /> {success}
          </motion.div>
        )}
        {error && !showBuilder && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-bold">
            <AlertTriangle className="w-4 h-4" /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
        <Shield className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-black text-blue-800">How Escalation Works</p>
          <p className="text-xs text-blue-600 font-medium mt-0.5">
            When a ticket is created, the MST has a set time to start work. If they stay idle, it escalates to Level 1. Each level then has its own timeout before moving to the next.
            Mark a hierarchy as <strong>default</strong> to auto-attach it to new tickets for this property. Escalation stops when the ticket is resolved or closed.
          </p>
        </div>
      </div>

      {/* Hierarchy List */}
      {hierarchies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <TrendingUp className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-base font-black text-slate-800 mb-1">No escalation hierarchies yet</h3>
          <p className="text-sm text-slate-400 font-medium max-w-xs mb-6">
            Create your first escalation chain to automatically route unresolved tickets up the ladder.
          </p>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-black"
          >
            <Plus className="w-4 h-4" />
            Create First Hierarchy
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {hierarchies.map(h => (
            <HierarchyCard
              key={h.id}
              hierarchy={h}
              onEdit={openEdit}
              onDelete={deleteHierarchy}
              onToggleActive={toggleActive}
            />
          ))}
        </div>
      )}

    </div>
  );
}
