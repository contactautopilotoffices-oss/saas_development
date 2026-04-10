/**
 * SnagPreviewTable
 * Table view for previewing snag/issue import data before confirmation.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';

interface SnagRow {
    issue_description: string;
    issue_date: string;
    skill_group?: string;
    issue_code?: string | null;
    confidence?: string;
    isValid?: boolean;
    validationErrors?: string[];
}

interface SnagPreviewTableProps {
    rows: SnagRow[];
    totalRows: number;
    validRows: number;
    invalidRows: number;
    onConfirm: () => void;
    onCancel: () => void;
    isImporting: boolean;
}

const skillGroupColors: Record<string, { bg: string; text: string }> = {
    technical: { bg: 'rgba(59, 130, 246, 0.1)', text: 'rgb(59, 130, 246)' },
    plumbing: { bg: 'rgba(6, 182, 212, 0.1)', text: 'rgb(6, 182, 212)' },
    soft_services: { bg: 'rgba(168, 85, 247, 0.1)', text: 'rgb(168, 85, 247)' },
    vendor: { bg: 'rgba(245, 158, 11, 0.1)', text: 'rgb(245, 158, 11)' },
};

export default function SnagPreviewTable({
    rows,
    totalRows,
    validRows,
    invalidRows,
    onConfirm,
    onCancel,
    isImporting,
}: SnagPreviewTableProps) {
    return (
        <div className="w-full">
            {/* Summary Header */}
            <div
                className="flex items-center justify-between p-4 rounded-t-xl border-b"
                style={{
                    background: 'var(--surface)',
                    borderColor: 'var(--border)'
                }}
            >
                <div className="flex items-center gap-6">
                    <div className="text-center">
                        <p className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>{totalRows}</p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Total</p>
                    </div>
                    <div className="text-center">
                        <p className="text-2xl font-semibold text-[var(--success)]">{validRows}</p>
                        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Valid</p>
                    </div>
                    {invalidRows > 0 && (
                        <div className="text-center">
                            <p className="text-2xl font-semibold text-[var(--error)]">{invalidRows}</p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Invalid</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={onCancel}
                        disabled={isImporting}
                        className="px-4 py-2 rounded-lg border transition-colors"
                        style={{
                            borderColor: 'var(--border)',
                            color: 'var(--text-secondary)'
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isImporting || validRows === 0}
                        className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                        style={{
                            background: validRows > 0 ? 'var(--primary)' : 'var(--muted)',
                            color: validRows > 0 ? 'white' : 'var(--text-tertiary)'
                        }}
                    >
                        {isImporting ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Importing...
                            </>
                        ) : (
                            `Import ${validRows} Snags`
                        )}
                    </button>
                </div>
            </div>

            {/* Table */}
            <div
                className="overflow-x-auto border border-t-0 rounded-b-xl"
                style={{ borderColor: 'var(--border)' }}
            >
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ background: 'var(--surface-elevated)' }}>
                            <th className="p-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>#</th>
                            <th className="p-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Status</th>
                            <th className="p-3 text-left font-medium min-w-[300px]" style={{ color: 'var(--text-secondary)' }}>Issue Description</th>
                            <th className="p-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Date</th>
                            <th className="p-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Classification</th>
                            <th className="p-3 text-left font-medium" style={{ color: 'var(--text-secondary)' }}>Confidence</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, index) => (
                            <tr
                                key={index}
                                style={{
                                    background: row.isValid ? 'var(--surface)' : 'rgba(239, 68, 68, 0.05)',
                                    borderTop: '1px solid var(--border)'
                                }}
                            >
                                <td className="p-3" style={{ color: 'var(--text-tertiary)' }}>{index + 1}</td>
                                <td className="p-3">
                                    {row.isValid ? (
                                        <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <AlertCircle className="w-5 h-5 text-[var(--error)]" />
                                            <span className="text-xs text-[var(--error)]">
                                                {row.validationErrors?.join(', ')}
                                            </span>
                                        </div>
                                    )}
                                </td>
                                <td className="p-3" style={{ color: 'var(--text-primary)' }}>
                                    {row.issue_description || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                </td>
                                <td className="p-3" style={{ color: 'var(--text-primary)' }}>
                                    {row.issue_date || <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                                </td>
                                <td className="p-3">
                                    {row.skill_group && (
                                        <span
                                            className="px-2 py-1 rounded-full text-xs font-medium"
                                            style={{
                                                background: skillGroupColors[row.skill_group]?.bg || 'var(--muted)',
                                                color: skillGroupColors[row.skill_group]?.text || 'var(--text-secondary)',
                                            }}
                                        >
                                            {row.skill_group.replace('_', ' ')}
                                        </span>
                                    )}
                                </td>
                                <td className="p-3">
                                    <span
                                        className="px-2 py-1 rounded-full text-xs font-medium"
                                        style={{
                                            background: row.confidence === 'high' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                                            color: row.confidence === 'high' ? 'rgb(16, 185, 129)' : 'rgb(245, 158, 11)',
                                        }}
                                    >
                                        {row.confidence}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
