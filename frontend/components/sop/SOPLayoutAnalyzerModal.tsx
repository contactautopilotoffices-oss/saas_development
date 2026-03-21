'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, Sparkles, ChevronRight, MapPin, CheckSquare, RefreshCw, AlertCircle, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ChecklistItem {
    title: string;
    type: string;
}

interface TemplateSuggestion {
    title: string;
    description: string;
    frequency: string;
    items: ChecklistItem[];
}

interface AreaSuggestion {
    area: string;
    floor: string;
    category: string;
    templates: TemplateSuggestion[];
}

interface SOPLayoutAnalyzerModalProps {
    isOpen: boolean;
    onClose: () => void;
    propertyId: string;
    onSelectTemplate: (template: {
        title: string;
        description: string;
        category: string;
        frequency: string;
        items: ChecklistItem[];
    }) => void;
}

const categoryColors: Record<string, string> = {
    cleaning: 'bg-emerald-50 text-emerald-600',
    maintenance: 'bg-blue-50 text-blue-600',
    safety: 'bg-rose-50 text-rose-600',
    security: 'bg-violet-50 text-violet-600',
    inspection: 'bg-amber-50 text-amber-600',
};

function frequencyLabel(freq: string): string {
    const m = freq.match(/^every_(\d+)_hours?$/);
    if (m) return parseInt(m[1]) === 1 ? 'Every 1 hr' : `Every ${m[1]} hrs`;
    const map: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', on_demand: 'On Demand' };
    return map[freq] ?? freq;
}

/** Render first page of a PDF file to a PNG blob using pdfjs-dist */
async function pdfToImageBlob(file: File): Promise<{ blob: Blob; dataUrl: string; pageCount: number }> {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.mjs';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    const scale = 2; // higher = better quality
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;

    await (page.render as any)({ canvasContext: ctx, viewport }).promise;

    const dataUrl = canvas.toDataURL('image/png');
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'));

    return { blob, dataUrl, pageCount: pdf.numPages };
}

const SOPLayoutAnalyzerModal: React.FC<SOPLayoutAnalyzerModalProps> = ({
    isOpen,
    onClose,
    propertyId,
    onSelectTemplate,
}) => {
    const [step, setStep] = useState<'upload' | 'converting' | 'loading' | 'results' | 'error'>('upload');
    const [preview, setPreview] = useState<string | null>(null);
    const [uploadBlob, setUploadBlob] = useState<Blob | null>(null);
    const [isPdf, setIsPdf] = useState(false);
    const [pdfName, setPdfName] = useState('');
    const [pdfPageCount, setPdfPageCount] = useState(0);
    const [suggestions, setSuggestions] = useState<AreaSuggestion[]>([]);
    const [expandedArea, setExpandedArea] = useState<number | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const processFile = async (file: File) => {
        if (file.type === 'application/pdf') {
            setIsPdf(true);
            setPdfName(file.name);
            setStep('converting');
            try {
                const { blob, dataUrl, pageCount } = await pdfToImageBlob(file);
                setUploadBlob(blob);
                setPreview(dataUrl);
                setPdfPageCount(pageCount);
                setStep('upload');
            } catch (err: any) {
                setErrorMsg(`Failed to read PDF: ${err.message}`);
                setStep('error');
            }
        } else {
            setIsPdf(false);
            setUploadBlob(file);
            setPreview(URL.createObjectURL(file));
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    };

    const handleAnalyze = async () => {
        if (!uploadBlob) return;
        setStep('loading');

        try {
            const formData = new FormData();
            formData.append('image', uploadBlob, 'layout.png');

            const res = await fetch(`/api/properties/${propertyId}/sop/analyze-layout`, {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Analysis failed');
            if (!data.suggestions || data.suggestions.length === 0) {
                throw new Error('No areas detected. Please upload a clearer floor plan image.');
            }

            setSuggestions(data.suggestions);
            setExpandedArea(0);
            setStep('results');
        } catch (err: any) {
            setErrorMsg(err.message || 'Failed to analyze layout');
            setStep('error');
        }
    };

    const handleReset = () => {
        setStep('upload');
        setPreview(null);
        setUploadBlob(null);
        setIsPdf(false);
        setPdfName('');
        setPdfPageCount(0);
        setSuggestions([]);
        setErrorMsg('');
        setExpandedArea(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleUseTemplate = (area: AreaSuggestion, template: TemplateSuggestion) => {
        onSelectTemplate({
            title: template.title,
            description: `${template.description} — ${area.area} (${area.floor})`,
            category: area.category,
            frequency: template.frequency,
            items: template.items,
        });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
                        <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                                <Sparkles size={16} className="text-primary" />
                            </div>
                            <div>
                                <h2 className="font-black text-sm text-slate-900 tracking-tight">AI Template Generator</h2>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">From Building Layout</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto">

                        {/* Converting PDF Step */}
                        {step === 'converting' && (
                            <div className="flex flex-col items-center justify-center py-20 px-6">
                                <div className="relative w-14 h-14 mb-4">
                                    <div className="absolute inset-0 rounded-full border-4 border-rose-100" />
                                    <div className="absolute inset-0 rounded-full border-4 border-rose-400 border-t-transparent animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <FileText size={16} className="text-rose-500" />
                                    </div>
                                </div>
                                <p className="font-black text-sm text-slate-900 mb-1">Processing PDF</p>
                                <p className="text-xs text-slate-500 font-medium text-center max-w-xs">
                                    Rendering floor plan from PDF…
                                </p>
                            </div>
                        )}

                        {/* Upload Step */}
                        {step === 'upload' && (
                            <div className="p-5 space-y-4">
                                <p className="text-xs text-slate-500 font-medium">
                                    Upload a floor plan or building layout. AI will identify areas and suggest checklist templates for each.
                                </p>

                                {/* Drop zone */}
                                <div
                                    onDrop={handleDrop}
                                    onDragOver={(e) => e.preventDefault()}
                                    onClick={() => !preview && fileInputRef.current?.click()}
                                    className={`relative border-2 border-dashed rounded-xl transition-all overflow-hidden ${preview ? 'border-primary/40 bg-primary/5' : 'border-slate-200 hover:border-primary/40 hover:bg-slate-50 cursor-pointer'}`}
                                >
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
                                        className="hidden"
                                        onChange={handleFileChange}
                                    />

                                    {preview ? (
                                        <div className="relative">
                                            {/* PDF badge */}
                                            {isPdf && (
                                                <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-rose-500 text-white px-2 py-1 rounded-lg shadow-sm">
                                                    <FileText size={11} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest">PDF</span>
                                                    {pdfPageCount > 0 && (
                                                        <span className="text-[10px] font-bold opacity-80">· Page 1 of {pdfPageCount}</span>
                                                    )}
                                                </div>
                                            )}
                                            <img src={preview} alt="Floor plan" className="w-full max-h-64 object-contain p-2" />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                                                className="absolute bottom-2 right-2 bg-black/60 hover:bg-black/80 text-white text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-widest transition-all"
                                            >
                                                Change
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center py-12 px-6 text-center">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
                                                <Upload size={20} className="text-slate-400" />
                                            </div>
                                            <p className="font-black text-sm text-slate-700">Drop floor plan here</p>
                                            <p className="text-xs text-slate-400 mt-1 font-medium">or click to browse</p>
                                            <div className="flex items-center gap-2 mt-3">
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded uppercase tracking-widest">JPEG</span>
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded uppercase tracking-widest">PNG</span>
                                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-black rounded uppercase tracking-widest">WebP</span>
                                                <span className="px-2 py-0.5 bg-rose-50 text-rose-500 text-[10px] font-black rounded uppercase tracking-widest">PDF</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* PDF filename hint */}
                                {isPdf && pdfName && (
                                    <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 rounded-lg border border-rose-100">
                                        <FileText size={13} className="text-rose-500 flex-shrink-0" />
                                        <p className="text-xs font-bold text-rose-700 truncate">{pdfName}</p>
                                        <p className="text-[10px] text-rose-400 font-medium flex-shrink-0">· Analyzing page 1</p>
                                    </div>
                                )}

                                {preview && (
                                    <div className="flex gap-2 pt-1">
                                        <button
                                            onClick={handleReset}
                                            className="flex-1 py-2.5 border border-slate-200 text-slate-600 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-50 transition-all"
                                        >
                                            Clear
                                        </button>
                                        <button
                                            onClick={handleAnalyze}
                                            className="flex-1 py-2.5 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                                        >
                                            <Sparkles size={13} />
                                            Analyze Layout
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Loading Step */}
                        {step === 'loading' && (
                            <div className="flex flex-col items-center justify-center py-20 px-6">
                                <div className="relative w-16 h-16 mb-5">
                                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                                    <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <Sparkles size={18} className="text-primary" />
                                    </div>
                                </div>
                                <p className="font-black text-sm text-slate-900 mb-1">Analyzing Floor Plan</p>
                                <p className="text-xs text-slate-500 font-medium text-center max-w-xs">
                                    AI is identifying areas and generating tailored checklist templates…
                                </p>
                            </div>
                        )}

                        {/* Error Step */}
                        {step === 'error' && (
                            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                                <div className="w-14 h-14 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
                                    <AlertCircle size={22} className="text-rose-500" />
                                </div>
                                <p className="font-black text-sm text-slate-900 mb-1">Failed</p>
                                <p className="text-xs text-slate-500 font-medium max-w-xs mb-5">{errorMsg}</p>
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all"
                                >
                                    <RefreshCw size={12} />
                                    Try Again
                                </button>
                            </div>
                        )}

                        {/* Results Step */}
                        {step === 'results' && (
                            <div className="p-5 space-y-3">
                                <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs text-slate-500 font-medium">
                                        Found <span className="font-black text-slate-900">{suggestions.length} areas</span> — select a template to use it
                                    </p>
                                    <button
                                        onClick={handleReset}
                                        className="flex items-center gap-1 text-[10px] font-black text-slate-400 hover:text-slate-700 uppercase tracking-widest"
                                    >
                                        <RefreshCw size={10} />
                                        Re-analyze
                                    </button>
                                </div>

                                {suggestions.map((area, areaIdx) => (
                                    <div key={areaIdx} className="border border-slate-200 rounded-xl overflow-hidden">
                                        {/* Area header */}
                                        <button
                                            onClick={() => setExpandedArea(expandedArea === areaIdx ? null : areaIdx)}
                                            className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-all text-left"
                                        >
                                            <div className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center flex-shrink-0">
                                                <MapPin size={13} className="text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-xs text-slate-900 truncate">{area.area}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{area.floor}</p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${categoryColors[area.category] || 'bg-slate-100 text-slate-500'}`}>
                                                    {area.category}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400">{area.templates.length} templates</span>
                                                <ChevronRight
                                                    size={14}
                                                    className={`text-slate-400 transition-transform ${expandedArea === areaIdx ? 'rotate-90' : ''}`}
                                                />
                                            </div>
                                        </button>

                                        {/* Templates for this area */}
                                        <AnimatePresence>
                                            {expandedArea === areaIdx && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    className="overflow-hidden"
                                                >
                                                    <div className="divide-y divide-slate-100">
                                                        {area.templates.map((template, tIdx) => (
                                                            <div key={tIdx} className="px-4 py-3">
                                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                                    <div className="flex-1 min-w-0">
                                                                        <p className="font-black text-xs text-slate-900">{template.title}</p>
                                                                        <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">{template.description}</p>
                                                                    </div>
                                                                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                                                                            {frequencyLabel(template.frequency)}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => handleUseTemplate(area, template)}
                                                                            className="px-3 py-1 bg-primary text-white rounded-lg font-black text-[9px] uppercase tracking-widest hover:opacity-90 transition-all shadow-sm shadow-primary/20"
                                                                        >
                                                                            Use This
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                                {/* Items preview */}
                                                                <div className="space-y-1">
                                                                    {template.items.slice(0, 4).map((item, iIdx) => (
                                                                        <div key={iIdx} className="flex items-center gap-2">
                                                                            <CheckSquare size={10} className="text-slate-300 flex-shrink-0" />
                                                                            <span className="text-[10px] text-slate-500 font-medium">{item.title}</span>
                                                                        </div>
                                                                    ))}
                                                                    {template.items.length > 4 && (
                                                                        <p className="text-[10px] text-slate-400 font-bold pl-4">
                                                                            +{template.items.length - 4} more items
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default SOPLayoutAnalyzerModal;
