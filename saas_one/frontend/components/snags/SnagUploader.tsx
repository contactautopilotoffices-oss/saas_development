/**
 * SnagUploader
 * Drag-and-drop file uploader for CSV/Excel snag import with validation.
 * @remarks Client component.
 */

'use client';

import React, { useState, useCallback } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X } from 'lucide-react';

interface SnagUploaderProps {
    propertyId: string;
    organizationId: string;
    onPreviewReady: (data: PreviewData) => void;
    onError: (error: string) => void;
}

interface PreviewData {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    rows: SnagRow[];
    errors: string[];
    file: File; // Store the original file for confirm import
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

export default function SnagUploader({
    propertyId,
    organizationId,
    onPreviewReady,
    onError
}: SnagUploaderProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [fileName, setFileName] = useState<string | null>(null);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            processFile(files[0]);
        }
    }, []);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            processFile(files[0]);
        }
    }, []);

    const processFile = async (file: File) => {
        const validTypes = ['.csv', '.xlsx', '.xls'];
        const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

        if (!validTypes.includes(extension)) {
            onError('Invalid file type. Please upload a CSV or Excel file.');
            return;
        }

        setFileName(file.name);
        setIsUploading(true);

        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('propertyId', propertyId);
            formData.append('organizationId', organizationId);
            formData.append('confirmImport', 'false'); // Preview only

            const response = await fetch('/api/tickets/bulk-import', {
                method: 'POST',
                body: formData,
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed');
            }

            onPreviewReady({ ...data, file });
        } catch (error) {
            onError(error instanceof Error ? error.message : 'Upload failed');
        } finally {
            setIsUploading(false);
        }
    };

    const clearFile = () => {
        setFileName(null);
    };

    return (
        <div className="w-full">
            {!fileName ? (
                <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
            relative border-2 border-dashed rounded-xl p-8
            flex flex-col items-center justify-center gap-4
            transition-all duration-200 cursor-pointer
            ${isDragging
                            ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                            : 'border-[var(--border)] hover:border-[var(--primary)]/50'
                        }
          `}
                    style={{ minHeight: '200px' }}
                >
                    <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />

                    <div className="p-4 rounded-full bg-[var(--primary)]/10">
                        <Upload className="w-8 h-8 text-[var(--primary)]" />
                    </div>

                    <div className="text-center">
                        <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                            Drop your CSV or Excel file here
                        </p>
                        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
                            or click to browse
                        </p>
                    </div>

                    <div className="flex items-center gap-4 mt-2">
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>CSV</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Excel (.xlsx, .xls)</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    className="border rounded-xl p-4 flex items-center justify-between"
                    style={{
                        borderColor: 'var(--border)',
                        background: 'var(--surface)'
                    }}
                >
                    <div className="flex items-center gap-3">
                        {isUploading ? (
                            <div className="w-10 h-10 rounded-lg bg-[var(--primary)]/10 flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : (
                            <div className="w-10 h-10 rounded-lg bg-[var(--success)]/10 flex items-center justify-center">
                                <CheckCircle className="w-5 h-5 text-[var(--success)]" />
                            </div>
                        )}
                        <div>
                            <p className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {fileName}
                            </p>
                            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                                {isUploading ? 'Processing...' : 'Ready for preview'}
                            </p>
                        </div>
                    </div>

                    {!isUploading && (
                        <button
                            onClick={clearFile}
                            className="p-2 rounded-lg hover:bg-[var(--surface-elevated)] transition-colors"
                        >
                            <X className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
                        </button>
                    )}
                </div>
            )}

            {/* Template hint */}
            <div
                className="mt-4 p-3 rounded-lg flex items-start gap-2"
                style={{ background: 'var(--info)/10' }}
            >
                <AlertCircle className="w-4 h-4 mt-0.5 text-[var(--info)]" />
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    <p className="font-medium">CSV Template Format:</p>
                    <code className="text-xs block mt-1 p-2 rounded" style={{ background: 'var(--surface-elevated)' }}>
                        issue_description,issue_date<br />
                        "AC not cooling properly",15-01-2026
                    </code>
                </div>
            </div>
        </div>
    );
}
