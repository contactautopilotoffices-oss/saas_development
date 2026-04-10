/**
 * SnagIntakeDashboard
 *
 * Snag (defect) intake and batch processing dashboard.
 * Supports CSV/Excel upload, row-level validation preview, bulk import,
 * department routing via drag-and-drop, and auto-assignment to technicians.
 *
 * Features:
 * - Upload view: drag-and-drop file upload with SnagUploader component
 * - Preview view: row validation, classification confidence, error review
 * - Dashboard view: department kanban-style grid with 4 service columns
 *   (Technical, Plumbing, Soft Services, Vendor)
 * - Drag-and-drop between departments with API override call
 * - Bulk assign all tickets to matching MSTs (Multi-Skilled Technicians)
 * - Department summary count cards
 * - Success/error alert feedback
 *
 * @example
 * <SnagIntakeDashboard
 *   propertyId="prop_123"
 *   organizationId="org_456"
 * />
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, Plus, Check, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';
import SnagUploader from './SnagUploader';
import SnagPreviewTable from './SnagPreviewTable';
import { playTickleSound } from '@/frontend/utils/sounds';

interface Ticket {
    id: string;
    ticket_number: string;
    issue_description: string;
    issue_date: string;
    priority: 'low' | 'medium' | 'high';
    skill_group?: string;
    status: string;
    // Department column values (only one populated)
    technical: string;
    plumbing: string;
    soft_services: string;
    vendor: string;
}

interface SnagRow {
    issue_description: string;
    issue_date: string;
    skill_group?: string;
    issue_code?: string | null;
    confidence?: string;
    isValid?: boolean;
    validationErrors?: string[];
}

interface PreviewData {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    rows: SnagRow[];
    errors: string[];
    file: File; // Store the original file for confirm import
}

interface SnagIntakeDashboardProps {
    propertyId: string;
    organizationId: string;
}

const serviceColumns = [
    { key: 'technical', title: 'Technical', bgClass: 'bg-blue-50' },
    { key: 'plumbing', title: 'Plumbing', bgClass: 'bg-cyan-50' },
    { key: 'soft_services', title: 'Soft Services', bgClass: 'bg-purple-50' },
    { key: 'vendor', title: 'Vendor', bgClass: 'bg-amber-50' },
] as const;

const priorityStyles: Record<string, { bg: string; text: string; border: string }> = {
    high: { bg: 'rgba(239, 68, 68, 0.1)', text: 'rgb(239, 68, 68)', border: 'rgba(239, 68, 68, 0.3)' },
    medium: { bg: 'rgba(245, 158, 11, 0.1)', text: 'rgb(245, 158, 11)', border: 'rgba(245, 158, 11, 0.3)' },
    low: { bg: 'rgba(16, 185, 129, 0.1)', text: 'rgb(16, 185, 129)', border: 'rgba(16, 185, 129, 0.3)' },
};

export default function SnagIntakeDashboard({ propertyId, organizationId }: SnagIntakeDashboardProps) {
    const router = useRouter();
    const [view, setView] = useState<'upload' | 'preview' | 'dashboard'>('upload');
    const [previewData, setPreviewData] = useState<PreviewData | null>(null);
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [draggedData, setDraggedData] = useState<{ ticketId: string; fromColumn: string } | null>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isAssigning, setIsAssigning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handlePreviewReady = (data: PreviewData) => {
        setPreviewData(data);
        setView('preview');
        setError(null);
    };

    const handleConfirmImport = async () => {
        if (!previewData) return;

        setIsImporting(true);
        setError(null);

        try {
            // Use the file stored in previewData
            if (!previewData.file) {
                throw new Error('File not found');
            }

            const formData = new FormData();
            formData.append('file', previewData.file);
            formData.append('propertyId', propertyId);
            formData.append('organizationId', organizationId);
            formData.append('confirmImport', 'true');

            const response = await fetch('/api/tickets/bulk-import', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Import failed');
            }

            console.log('Import API response:', data);
            console.log('Inserted tickets:', data.tickets);

            // Convert to dashboard format - use actual ticket IDs from response
            const importedTickets: Ticket[] = previewData.rows
                .filter(row => row.isValid)
                .map((row, idx) => {
                    const ticketFromDB = data.tickets?.[idx];
                    console.log(`Ticket ${idx}:`, ticketFromDB);

                    return {
                        id: ticketFromDB?.id || `temp-${idx}`,
                        ticket_number: ticketFromDB?.title || `TKT-${idx}`,
                        issue_description: row.issue_description,
                        issue_date: row.issue_date,
                        priority: 'medium' as const,
                        skill_group: row.skill_group,
                        status: ticketFromDB?.status || 'open',
                        technical: row.skill_group === 'technical' ? row.issue_description : '',
                        plumbing: row.skill_group === 'plumbing' ? row.issue_description : '',
                        soft_services: row.skill_group === 'soft_services' ? row.issue_description : '',
                        vendor: row.skill_group === 'vendor' ? row.issue_description : '',
                    };
                });

            console.log('Imported tickets with IDs:', importedTickets.map(t => t.id));

            setTickets(importedTickets);
            setView('dashboard');

            // Play tickle sound on success
            playTickleSound();

            if (data.assignmentSummary) {
                setSuccessMessage(`Imported ${importedTickets.length} snags. Auto-assigned ${data.assignmentSummary.assigned} to matching technicians.`);
            } else {
                setSuccessMessage(`Successfully imported ${importedTickets.length} snags`);
            }
            setTimeout(() => setSuccessMessage(null), 7000);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Import failed');
        } finally {
            setIsImporting(false);
        }
    };

    const handleCancelPreview = () => {
        setPreviewData(null);
        setView('upload');
    };

    const handleDragStart = (ticketId: string, column: string) => {
        setDraggedData({ ticketId, fromColumn: column });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (ticketId: string, toColumn: string) => {
        if (!draggedData) return;

        const { ticketId: sourceTicketId, fromColumn } = draggedData;

        if (sourceTicketId !== ticketId && fromColumn === toColumn) {
            setDraggedData(null);
            return;
        }

        // Update local state
        setTickets(prev => prev.map(ticket => {
            if (ticket.id === sourceTicketId) {
                const description = ticket[fromColumn as keyof Ticket] as string;
                return {
                    ...ticket,
                    [fromColumn]: '',
                    [toColumn]: description,
                    skill_group: toColumn,
                };
            }
            return ticket;
        }));

        // Call override API
        try {
            await fetch(`/api/tickets/${sourceTicketId}/override`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ skill_group_code: toColumn }),
            });
        } catch (err) {
            console.error('Override failed:', err);
        }

        setDraggedData(null);
    };

    const handleAssign = async () => {
        setIsAssigning(true);
        setError(null);

        try {
            const ticketIds = tickets.map(t => t.id);

            const response = await fetch('/api/tickets/bulk-assign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_ids: ticketIds,
                    property_id: propertyId,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Assignment failed');
            }

            setSuccessMessage(`Assigned ${data.summary.assigned} tickets. ${data.summary.waitlisted} waitlisted.`);
            setTimeout(() => setSuccessMessage(null), 5000);

            // Update ticket statuses
            setTickets(prev => prev.map(ticket => {
                const result = data.results.find((r: { ticketId: string }) => r.ticketId === ticket.id);
                return result ? { ...ticket, status: result.status } : ticket;
            }));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Assignment failed');
        } finally {
            setIsAssigning(false);
        }
    };

    // Compute summary
    const summary = serviceColumns.map(col => ({
        key: col.key,
        title: col.title,
        count: tickets.filter(t => t[col.key as keyof Ticket]).length,
    }));

    return (
        <div className="min-h-screen p-6" style={{ background: 'var(--background)' }}>
            <div className="max-w-full mx-auto">
                {/* Header */}
                <header className="mb-6">
                    <div className="flex items-center gap-4 mb-2">
                        <button
                            onClick={() => router.back()}
                            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                            style={{ color: 'var(--text-secondary)' }}
                        >
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                        <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                            Snag Intake Dashboard
                        </h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)' }}>
                        {view === 'upload' && 'Upload CSV/Excel to import snags'}
                        {view === 'preview' && 'Review classification before importing'}
                        {view === 'dashboard' && 'Drag tickets between departments or assign to MSTs'}
                    </p>
                </header>

                {/* Alerts */}
                {error && (
                    <div
                        className="mb-4 p-4 rounded-lg flex items-center gap-3"
                        style={{ background: 'rgba(239, 68, 68, 0.1)' }}
                    >
                        <AlertTriangle className="w-5 h-5 text-[var(--error)]" />
                        <span style={{ color: 'var(--error)' }}>{error}</span>
                    </div>
                )}

                {successMessage && (
                    <div
                        className="mb-4 p-4 rounded-lg flex items-center gap-3"
                        style={{ background: 'rgba(16, 185, 129, 0.1)' }}
                    >
                        <Check className="w-5 h-5 text-[var(--success)]" />
                        <span style={{ color: 'var(--success)' }}>{successMessage}</span>
                    </div>
                )}

                {/* Upload View */}
                {view === 'upload' && (
                    <div
                        className="rounded-xl p-6"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                    >
                        <SnagUploader
                            propertyId={propertyId}
                            organizationId={organizationId}
                            onPreviewReady={handlePreviewReady}
                            onError={setError}
                        />
                    </div>
                )}

                {/* Preview View */}
                {view === 'preview' && previewData && (
                    <SnagPreviewTable
                        rows={previewData.rows}
                        totalRows={previewData.totalRows}
                        validRows={previewData.validRows}
                        invalidRows={previewData.invalidRows}
                        onConfirm={handleConfirmImport}
                        onCancel={handleCancelPreview}
                        isImporting={isImporting}
                    />
                )}

                {/* Dashboard View */}
                {view === 'dashboard' && (
                    <>
                        {/* Main Table */}
                        <div
                            className="rounded-xl overflow-x-auto"
                            style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
                        >
                            <table className="w-full border-collapse text-sm">
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border)' }}>
                                        <th className="p-3 text-left font-medium w-16" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>#</th>
                                        <th className="p-3 text-left font-medium min-w-[200px]" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>Issue Description</th>
                                        <th className="p-3 text-left font-medium w-28" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>Date</th>
                                        <th className="p-3 text-left font-medium w-24" style={{ background: 'var(--surface-elevated)', color: 'var(--text-secondary)' }}>Priority</th>
                                        {serviceColumns.map(({ key, title, bgClass }) => (
                                            <th
                                                key={key}
                                                className={`p-3 text-left font-medium min-w-[180px] ${bgClass}`}
                                                style={{ color: 'var(--text-secondary)' }}
                                            >
                                                {title}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {tickets.map((ticket, idx) => (
                                        <tr
                                            key={ticket.id}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface-elevated)'
                                            }}
                                        >
                                            <td className="p-3 font-medium" style={{ color: 'var(--text-tertiary)' }}>
                                                {idx + 1}
                                            </td>
                                            <td className="p-3" style={{ color: 'var(--text-primary)' }}>
                                                {ticket.issue_description}
                                            </td>
                                            <td className="p-3" style={{ color: 'var(--text-primary)' }}>
                                                {ticket.issue_date}
                                            </td>
                                            <td className="p-3">
                                                <span
                                                    className="px-2 py-1 rounded text-xs font-medium"
                                                    style={{
                                                        background: priorityStyles[ticket.priority].bg,
                                                        color: priorityStyles[ticket.priority].text,
                                                        border: `1px solid ${priorityStyles[ticket.priority].border}`,
                                                    }}
                                                >
                                                    {ticket.priority}
                                                </span>
                                            </td>
                                            {serviceColumns.map(({ key, bgClass }) => (
                                                <td
                                                    key={key}
                                                    className={`p-2 ${bgClass}`}
                                                    onDragOver={handleDragOver}
                                                    onDrop={() => handleDrop(ticket.id, key)}
                                                >
                                                    {ticket[key as keyof Ticket] ? (
                                                        <div
                                                            draggable
                                                            onDragStart={() => handleDragStart(ticket.id, key)}
                                                            className="p-2 rounded cursor-move flex items-center gap-2 transition-shadow hover:shadow-md"
                                                            style={{
                                                                background: 'var(--surface)',
                                                                border: '1px solid var(--border)'
                                                            }}
                                                        >
                                                            <GripVertical className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                                                            <span className="text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                                                                {ticket[key as keyof Ticket]}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            className="h-10 border-2 border-dashed rounded flex items-center justify-center text-xs"
                                                            style={{
                                                                borderColor: 'var(--border)',
                                                                color: 'var(--text-tertiary)'
                                                            }}
                                                        >
                                                            Drop here
                                                        </div>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 flex justify-center items-center gap-4">
                            <button
                                onClick={() => setView('upload')}
                                className="px-4 py-2 rounded-lg border transition-colors flex items-center gap-2"
                                style={{
                                    borderColor: 'var(--border)',
                                    color: 'var(--text-secondary)'
                                }}
                            >
                                <Plus className="w-4 h-4" />
                                Import More
                            </button>

                            <button
                                onClick={handleAssign}
                                disabled={isAssigning || tickets.length === 0}
                                className="px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                                style={{
                                    background: 'var(--primary)',
                                    color: 'white'
                                }}
                            >
                                {isAssigning ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Assigning...
                                    </>
                                ) : (
                                    'Assign All'
                                )}
                            </button>
                        </div>

                        {/* Summary Cards */}
                        <div
                            className="mt-6 p-6 rounded-xl"
                            style={{ background: 'var(--surface)', boxShadow: 'var(--shadow-lg)' }}
                        >
                            <h3 className="text-lg font-medium mb-4" style={{ color: 'var(--text-primary)' }}>
                                Department Summary
                            </h3>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {summary.map(({ key, title, count }) => (
                                    <div
                                        key={key}
                                        className="text-center p-4 rounded-lg"
                                        style={{ background: 'var(--surface-elevated)' }}
                                    >
                                        <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>{count}</p>
                                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{title}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
