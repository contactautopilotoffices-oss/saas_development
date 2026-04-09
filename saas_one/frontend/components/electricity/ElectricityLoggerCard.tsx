/**
 * ElectricityLoggerCard
 * Card component for logging electricity meter readings and viewing consumption.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Settings2, RotateCcw, Save, Trash2, Camera, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon, Zap, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { compressImage } from '@/frontend/utils/image-compression';
import CameraCaptureModal from '../shared/CameraCaptureModal';

interface ElectricityMeter {
    id: string;
    name: string;
    meter_number?: string;
    meter_type?: string;
    max_load_kw?: number;
    status: string;
    last_reading?: number;
    property_id: string;
}

interface MeterMultiplier {
    id: string;
    multiplier_value: number;
    ct_ratio_primary: number;
    ct_ratio_secondary: number;
    pt_ratio_primary: number;
    pt_ratio_secondary: number;
    meter_constant: number;
    effective_from: string;
    reason?: string;
}

interface ElectricityReading {
    opening_reading: number;
    closing_reading: number;
    computed_units?: number;
    final_units?: number;
    multiplier_id?: string;
    multiplier_value?: number;
    notes?: string;
    reading_date?: string;
    photo_url?: string;
    ocr_reading?: number;
    ocr_confidence?: number;
    ocr_status?: string;
}

interface ElectricityLoggerCardProps {
    meter: ElectricityMeter;
    previousClosing?: number;
    averageConsumption?: number; /* logic preserved for valid check, but hidden from UI */
    multipliers?: MeterMultiplier[];
    activeTariffRate?: number;
    onReadingChange: (meterId: string, reading: ElectricityReading) => void;
    onSave?: (meterId: string) => Promise<void>;
    onMultiplierSave?: (meterId: string, multiplierData: any) => Promise<void>;
    onDelete?: (meterId: string) => void;
    isSubmitting?: boolean;
    isDark?: boolean;
    retakeTask?: {
        id: string;
        reading_date: string;
        opening_reading: number;
        closing_reading: number;
        photo_url?: string;
    };
}

/**
 * Electricity Logger Card v2.1
 * PRD: Pure input, no analytics, no cost shown.
 * Front: Opening (Auto), Closing (User), Save Entry.
 * Back: Multiplier (Constant), Effective From, Reason, Save.
 */
const ElectricityLoggerCard: React.FC<ElectricityLoggerCardProps> = ({
    meter,
    previousClosing,
    averageConsumption,
    multipliers = [],
    activeTariffRate = 0,
    onReadingChange,
    onSave,
    onMultiplierSave,
    onDelete,
    isSubmitting = false,
    isDark = false,
    retakeTask
}) => {
    const [openingReading, setOpeningReading] = useState<number>(retakeTask ? retakeTask.opening_reading : (previousClosing || meter.last_reading || 0));
    const [closingReading, setClosingReading] = useState<string>('');
    const [readingDate, setReadingDate] = useState<string>(retakeTask ? retakeTask.reading_date.split('T')[0] : new Date().toISOString().split('T')[0]);
    const [isFlipped, setIsFlipped] = useState(false);

    // Multiplier state
    const [selectedMultiplierId, setSelectedMultiplierId] = useState<string | null>(null);
    const [selectedMultiplierValue, setSelectedMultiplierValue] = useState<number>(1);

    // Multiplier editor state (card back)
    const [editCtPrimary, setEditCtPrimary] = useState<string>('200');
    const [editCtSecondary, setEditCtSecondary] = useState<string>('5');
    const [editPtPrimary, setEditPtPrimary] = useState<string>('11000');
    const [editPtSecondary, setEditPtSecondary] = useState<string>('110');
    const [editMeterConstant, setEditMeterConstant] = useState<string>('1');
    const [editEffectiveFrom, setEditEffectiveFrom] = useState(new Date().toISOString().split('T')[0]);
    const [editReason, setEditReason] = useState('');
    const [isSavingMultiplier, setIsSavingMultiplier] = useState(false);

    // OCR & Photo State
    const [capturedPhotoUrl, setCapturedPhotoUrl] = useState<string | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isOcrProcessing, setIsOcrProcessing] = useState(false);
    const [ocrResult, setOcrResult] = useState<{ reading: number; confidence: number; is_blurry: boolean; unit?: string; conversion_applied?: boolean; pf_used?: number } | null>(null);
    const [statusMessage, setStatusMessage] = useState<{ text: string, type: 'info' | 'success' | 'error' } | null>(null);
    const [showPhotoMenu, setShowPhotoMenu] = useState(false);
    const [showCameraModal, setShowCameraModal] = useState(false);
    
    // Hidden input refs
    const cameraInputRef = React.useRef<HTMLInputElement>(null);
    const galleryInputRef = React.useRef<HTMLInputElement>(null);

    // Derived state for input
    const numericClosing = closingReading === '' ? 0 : parseFloat(closingReading);
    const hasValidReading = !isNaN(numericClosing) && closingReading !== '' && numericClosing > openingReading;

    // Set default multiplier
    useEffect(() => {
        if (multipliers.length > 0 && !selectedMultiplierId) {
            const active = multipliers[0]; // First is most recent
            setSelectedMultiplierId(active.id);
            setSelectedMultiplierValue(active.multiplier_value || 1);

            // Pre-fill editor
            setEditCtPrimary(active.ct_ratio_primary?.toString() || '200');
            setEditCtSecondary(active.ct_ratio_secondary?.toString() || '5');
            setEditPtPrimary(active.pt_ratio_primary?.toString() || '11000');
            setEditPtSecondary(active.pt_ratio_secondary?.toString() || '110');
            setEditMeterConstant(active.meter_constant?.toString() || '1');
        }
    }, [multipliers, selectedMultiplierId]);

    // Set opening reading from previous closing (ignored if in retake mode)
    useEffect(() => {
        if (retakeTask) return;
        if (previousClosing !== undefined) {
            setOpeningReading(previousClosing);
        } else if (meter.last_reading) {
            setOpeningReading(meter.last_reading);
        }
    }, [previousClosing, meter.last_reading, retakeTask]);

    // Handle Date Change
    const handleDateChange = (date: string) => {
        setReadingDate(date);
        const numVal = closingReading === '' ? 0 : parseFloat(closingReading);

        if (closingReading !== '' && !isNaN(numVal) && numVal > openingReading) {
            onReadingChange(meter.id, {
                opening_reading: openingReading,
                closing_reading: numVal,
                computed_units: numVal - openingReading,
                final_units: (numVal - openingReading) * selectedMultiplierValue,
                multiplier_id: selectedMultiplierId || undefined,
                multiplier_value: selectedMultiplierValue,
                reading_date: date,
            });
        }
    };

    // Handle Closing Reading Change
    const handleClosingChange = (val: string) => {
        setClosingReading(val);
        const numVal = parseFloat(val);

        if (val !== '' && !isNaN(numVal) && numVal > openingReading) {
            onReadingChange(meter.id, {
                opening_reading: openingReading,
                closing_reading: numVal,
                computed_units: numVal - openingReading,
                final_units: (numVal - openingReading) * selectedMultiplierValue,
                multiplier_id: selectedMultiplierId || undefined,
                multiplier_value: selectedMultiplierValue,
                reading_date: readingDate,
            });
        }
    };

    // Handle Save Entry (Front)
    const handleSaveEntry = async () => {
        if (onSave && hasValidReading) {
            await onSave(meter.id);
            // Reset OCR/Photo after save
            setCapturedPhotoUrl(null);
            setOcrResult(null);
        }
    };

    // Core logic for processing and uploading a meter photo
    const processMeterPhoto = async (file: File) => {
        if (!file) return;

        setIsUploading(true);
        setStatusMessage({ text: 'Compressing image...', type: 'info' });
        try {
            // 0. Compress Image
            const compressedFile = await compressImage(file, {
                maxWidth: 1024,
                maxSizeKB: 500,
                format: 'image/webp'
            });

            const { createClient } = await import('@/frontend/utils/supabase/client');
            const supabase = createClient();

            // 1. Upload to Supabase Storage
            const fileExt = compressedFile.name.split('.').pop();
            const fileName = `${meter.id}_${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`; // bucket path is top-level

            setStatusMessage({ text: 'Uploading photo...', type: 'info' });
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('meter-readings') 
                .upload(filePath, compressedFile);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('meter-readings')
                .getPublicUrl(filePath);

            setCapturedPhotoUrl(publicUrl);

            // 2. Trigger OCR API
            setStatusMessage({ text: 'AI Extraction in progress...', type: 'info' });
            setIsOcrProcessing(true);
            const ocrRes = await fetch('/api/ocr/meter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    imageUrl: publicUrl,
                    meterId: meter.id,
                    propertyId: meter.property_id
                })
            });

            if (!ocrRes.ok) throw new Error('OCR failed');
            const ocrData = await ocrRes.json();
            
            setOcrResult(ocrData);
            setStatusMessage({ text: 'OCR Completed Successfully', type: 'success' });
            setTimeout(() => setStatusMessage(null), 3000);

            // 3. Auto-fill if confidence is high
            if (ocrData.reading && ocrData.confidence > 80) {
                handleClosingChange(ocrData.reading.toString());
            }

        } catch (error) {
            console.error('Photo upload/OCR failed:', error);
            setStatusMessage({ text: 'Upload or OCR failed. Try again.', type: 'error' });
            setTimeout(() => setStatusMessage(null), 4000);
        } finally {
            setIsUploading(false);
            setIsOcrProcessing(false);
        }
    };

    // Handle File Input (Gallery)
    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        await processMeterPhoto(file);
    };

    // Handle Camera Modal Capture
    const handleCameraCapture = async (file: File) => {
        await processMeterPhoto(file);
    };

    // Notify parent of OCR status along with reading
    useEffect(() => {
        if (ocrResult && closingReading !== '') {
            const manualVal = parseFloat(closingReading);
            const isMatch = Math.abs(manualVal - ocrResult.reading) < 0.01;
            let status = 'pending';

            if (ocrResult.confidence >= 92 && isMatch) status = 'verified';
            else if (ocrResult.confidence < 75 || ocrResult.is_blurry) status = 'retake';
            else if (!isMatch) status = ocrResult.confidence >= 75 ? 'review' : 'mismatch';

            onReadingChange(meter.id, {
                opening_reading: openingReading,
                closing_reading: manualVal,
                computed_units: manualVal - openingReading,
                final_units: (manualVal - openingReading) * selectedMultiplierValue,
                multiplier_id: selectedMultiplierId || undefined,
                multiplier_value: selectedMultiplierValue,
                reading_date: readingDate,
                photo_url: capturedPhotoUrl || undefined,
                ocr_reading: ocrResult.reading,
                ocr_confidence: ocrResult.confidence,
                ocr_status: status
            });
        }
    }, [ocrResult, closingReading, capturedPhotoUrl]);

    // Handle Multiplier Save (Back)
    const handleSaveMultiplier = async () => {
        if (!onMultiplierSave) return;
        setIsSavingMultiplier(true);

        const cP = parseFloat(editCtPrimary) || 0;
        const cS = parseFloat(editCtSecondary) || 1;
        const pP = parseFloat(editPtPrimary) || 0;
        const pS = parseFloat(editPtSecondary) || 1;
        const mC = parseFloat(editMeterConstant) || 0;

        const computedVal = (cP / (cS || 1)) * (pP / (pS || 1)) * mC;

        try {
            await onMultiplierSave(meter.id, {
                meter_id: meter.id,
                ct_ratio_primary: cP,
                ct_ratio_secondary: cS,
                pt_ratio_primary: pP,
                pt_ratio_secondary: pS,
                meter_constant: mC,
                multiplier_value: computedVal,
                effective_from: editEffectiveFrom,
                reason: editReason
            });
            setIsFlipped(false);
        } catch (error) {
            console.error('Failed to save multiplier:', error);
        } finally {
            setIsSavingMultiplier(false);
        }
    };

    // Handle Delete
    const handleDelete = () => {
        if (onDelete && window.confirm('Are you sure you want to delete this meter? This action cannot be undone.')) {
            onDelete(meter.id);
        }
    };

    return (
        <div className="relative h-auto w-full" style={{ perspective: '1000px' }}>
            <motion.div
                initial={false}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
                className={`relative w-full h-full`}
                style={{ transformStyle: 'preserve-3d' }}
            >
                {/* Front */}
                <div
                    className={`relative w-full backface-hidden ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-3xl shadow-md border`}
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                >
                    {/* Status Strip */}
                    <div className={`absolute top-0 left-0 w-1.5 h-full ${hasValidReading ? 'bg-primary' : (isDark ? 'bg-[#21262d]' : 'bg-slate-200')} transition-colors z-10 rounded-l-3xl`} />

                    <div className="p-4 sm:p-5 pl-5 sm:pl-6 space-y-4">
                        {retakeTask && (
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-500 px-3 py-2 rounded-lg flex items-center justify-between shadow-[inset_0_1px_4px_rgba(0,0,0,0.1)]">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="w-4 h-4 shrink-0" />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wider">Retake Required</p>
                                        <p className="text-[10px] uppercase font-bold opacity-80">Photo mismatch or blur</p>
                                    </div>
                                </div>
                                <span className="text-[10px] font-black opacity-60">
                                    {new Date(retakeTask.reading_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}
                                </span>
                            </div>
                        )}

                        {/* Header row: name + action buttons inline */}
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'} leading-tight truncate`}>{meter.name}</h2>
                                <p className={`text-sm font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'} truncate`}>
                                    {meter.meter_type === 'main' ? 'Main Grid' : meter.meter_type || 'Meter'} · {meter.meter_number || 'No #'}
                                </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                    onClick={handleDelete}
                                    className={`${isDark ? 'text-red-400 hover:text-red-300 bg-[#21262d]' : 'text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100'} p-2 rounded-lg transition-colors`}
                                    title="Delete Meter"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setIsFlipped(true)}
                                    className={`${isDark ? 'text-slate-600 hover:text-primary bg-[#21262d]' : 'text-slate-400 hover:text-primary bg-slate-100'} p-2 rounded-lg transition-colors`}
                                    title="Configure Multiplier"
                                >
                                    <Settings2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        {/* Date Selection */}
                        <div>
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide block mb-1.5`}>
                                Reading Date
                            </span>
                            <input
                                type="date"
                                value={readingDate}
                                disabled={!!retakeTask}
                                onChange={(e) => handleDateChange(e.target.value)}
                                className={`w-full ${isDark ? 'bg-[#0d1117] border-[#21262d] text-white' : 'bg-white border-slate-200 text-slate-900'} font-bold rounded-xl p-3 border focus:outline-none focus:ring-2 focus:ring-primary/20 ${retakeTask ? 'opacity-50 cursor-not-allowed' : ''}`}
                                max={new Date().toISOString().split('T')[0]}
                            />
                        </div>

                        {/* Opening Reading (Auto) */}
                        <div className={`${isDark ? 'bg-[#0d1117] border-[#21262d]' : 'bg-slate-50 border-slate-200'} rounded-xl p-3 border border-dashed`}>
                            <span className={`text-xs font-bold ${isDark ? 'text-slate-500' : 'text-slate-500'} uppercase tracking-wide block mb-1`}>
                                Opening Reading (Auto)
                            </span>
                            <div className={`text-lg font-mono font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                                {openingReading.toFixed(2)} <span className="text-xs font-bold">kVAh</span>
                            </div>
                        </div>

                        {/* Closing Reading (User) */}
                        <div>
                            <div className="flex justify-between items-center mb-1.5">
                                <span className="text-xs font-bold text-primary uppercase tracking-wide">
                                    Closing Reading
                                </span>
                                {isOcrProcessing ? (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-primary animate-pulse">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        AI EXTRACTING...
                                    </span>
                                ) : ocrResult ? (
                                    <div className="flex items-center gap-2">
                                        <span className={`flex items-center gap-1 text-[10px] font-bold ${ocrResult.confidence >= 92 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                            {ocrResult.confidence >= 92 ? <CheckCircle2 className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                                            AI READ: {ocrResult.reading} ({ocrResult.confidence}%)
                                        </span>
                                        {ocrResult.conversion_applied && (
                                            <span className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-500 text-[9px] font-black uppercase tracking-tighter rounded-md border border-blue-500/20 animate-in fade-in zoom-in duration-500">
                                                <Zap className="w-2.5 h-2.5" />
                                                Converted (PF: {ocrResult.pf_used})
                                            </span>
                                        )}
                                    </div>
                                ) : null}
                            </div>
                            <div className="relative group">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={closingReading}
                                    onChange={(e) => handleClosingChange(e.target.value)}
                                    className={`w-full ${isDark ? 'bg-[#0d1117] border-primary/50 text-white placeholder-slate-600' : 'bg-white border-primary/30 text-slate-900 placeholder-slate-300'} border-2 focus:ring-4 focus:ring-primary/10 text-lg font-bold rounded-xl py-3.5 pl-4 pr-24 shadow-sm transition-all outline-none`}
                                    placeholder="Reading"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                    <span className={`text-[10px] font-bold ${isDark ? 'text-slate-600' : 'text-slate-400'} uppercase`}>kVAh</span>
                                    
                                    <div className="relative">
                                        <button 
                                            type="button"
                                            onClick={() => setShowPhotoMenu(!showPhotoMenu)}
                                            className={`p-2 rounded-lg transition-all ${capturedPhotoUrl ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 hover:bg-primary/10 hover:text-primary border border-transparent'}`}
                                            disabled={isUploading || isOcrProcessing}
                                        >
                                            {isUploading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                <Camera className="w-4 h-4" />
                                            )}
                                        </button>

                                        {/* WhatsApp Style Side Menu */}
                                        <AnimatePresence>
                                            {showPhotoMenu && (
                                                <>
                                                    <motion.div 
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        onClick={() => setShowPhotoMenu(false)}
                                                        className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[1px]"
                                                    />
                                                    <motion.div 
                                                        initial={{ opacity: 0, scale: 0.9, y: 10, x: -20 }}
                                                        animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                                                        exit={{ opacity: 0, scale: 0.9, y: 10, x: -20 }}
                                                        className="absolute bottom-full right-0 mb-3 z-[101] min-w-[160px] bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
                                                    >
                                                        <div className="p-1.5 flex flex-col gap-1">
                                                            <button 
                                                                onClick={() => {
                                                                    setShowPhotoMenu(false);
                                                                    setShowCameraModal(true);
                                                                }}
                                                                className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 transition-colors rounded-xl text-left"
                                                            >
                                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                                                    <Camera className="w-4 h-4" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-900 leading-none">Camera</p>
                                                                    <p className="text-[9px] text-slate-400 mt-1">Take a live photo</p>
                                                                </div>
                                                            </button>
                                                            <button 
                                                                onClick={() => {
                                                                    setShowPhotoMenu(false);
                                                                    galleryInputRef.current?.click();
                                                                }}
                                                                className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-slate-50 transition-colors rounded-xl text-left"
                                                            >
                                                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                                                    <ImageIcon className="w-4 h-4" />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-900 leading-none">Gallery</p>
                                                                    <p className="text-[9px] text-slate-400 mt-1">Choose existing</p>
                                                                </div>
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                </>
                                            )}
                                        </AnimatePresence>

                                        {/* Hidden Inputs */}
                                        <input
                                            ref={cameraInputRef}
                                            type="file"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={handlePhotoUpload}
                                            className="hidden"
                                        />
                                        <input
                                            ref={galleryInputRef}
                                            type="file"
                                            accept="image/*"
                                            onChange={handlePhotoUpload}
                                            className="hidden"
                                        />
                                    </div>
                                </div>
                            </div>

                            {statusMessage && (
                                <motion.div 
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                                        statusMessage.type === 'success' ? 'text-emerald-500' :
                                        statusMessage.type === 'error' ? 'text-red-500' :
                                        'text-primary animate-pulse'
                                    }`}
                                >
                                    {statusMessage.type === 'info' && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {statusMessage.type === 'success' && <CheckCircle2 className="w-3 h-3" />}
                                    {statusMessage.type === 'error' && <AlertCircle className="w-3 h-3" />}
                                    {statusMessage.text}
                                </motion.div>
                            )}

                            {capturedPhotoUrl && (
                                <div className="mt-2 relative h-12 w-full rounded-lg overflow-hidden border border-slate-200 group">
                                    <img src={capturedPhotoUrl} alt="Meter Read" className="h-full w-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                        <span className="text-[10px] font-black text-white drop-shadow-md uppercase tracking-widest">Photo Captured</span>
                                    </div>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            setCapturedPhotoUrl(null);
                                            setOcrResult(null);
                                            setStatusMessage(null);
                                        }}
                                        className="absolute right-1 top-1 p-1 bg-white/80 hover:bg-white text-slate-600 rounded-md shadow-sm backdrop-blur-sm transition-all"
                                        title="Remove photo and retake"
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Consumption Preview */}
                        {hasValidReading && (
                            <div className={`${isDark ? 'bg-primary/10 border-primary/20' : 'bg-primary/5 border-primary/10'} rounded-xl p-3 border`}>
                                <div className="flex justify-between items-center mb-0.5">
                                    <span className="text-xs font-bold text-primary uppercase">Multiplied Consumption</span>
                                    <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'} font-mono`}>×{selectedMultiplierValue.toFixed(2)}</span>
                                </div>
                                <div className="text-2xl font-black text-primary flex items-baseline gap-1">
                                    {((numericClosing - openingReading) * selectedMultiplierValue).toFixed(1)}
                                    <span className="text-sm font-bold opacity-60">kVAh</span>
                                </div>
                                <p className={`text-[10px] mt-0.5 ${isDark ? 'text-slate-600' : 'text-slate-400 font-medium'}`}>
                                    Raw: {(numericClosing - openingReading).toFixed(1)} kVAh
                                </p>
                            </div>
                        )}

                        {/* Save Button */}
                        <button
                            onClick={handleSaveEntry}
                            disabled={!hasValidReading || isSubmitting}
                            className={`w-full py-3.5 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${hasValidReading
                                ? 'bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20 active:scale-[0.98]'
                                : `${isDark ? 'bg-[#21262d] text-slate-600' : 'bg-slate-100 text-slate-400'} cursor-not-allowed`
                                }`}
                        >
                            {isSubmitting ? (
                                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <Save className="w-5 h-5" />
                                    Save Entry
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Back */}
                <div
                    className={`absolute inset-0 backface-hidden ${isDark ? 'bg-[#161b22] border-[#21262d]' : 'bg-white border-slate-200'} rounded-3xl shadow-md border overflow-y-auto`}
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                >
                    <div className="p-4 sm:p-5 flex flex-col bg-white">
                        {/* Header */}
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Meter Constant</h3>
                                <p className="text-xs text-slate-400">Multiplier Config</p>
                            </div>
                            <button
                                onClick={() => setIsFlipped(false)}
                                className="text-slate-500 hover:text-slate-900 p-2 rounded-lg transition-colors"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Multiplier Configuration Details */}
                        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
                            {/* CT Ratio */}
                            <div className="grid grid-cols-2 gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">CT Primary (A)</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editCtPrimary}
                                        onChange={(e) => setEditCtPrimary(e.target.value)}
                                        className="w-full bg-slate-50 border-slate-200 text-slate-900 font-bold p-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">CT Secondary (A)</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editCtSecondary}
                                        onChange={(e) => setEditCtSecondary(e.target.value)}
                                        className="w-full bg-slate-50 border-slate-200 text-slate-900 font-bold p-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </label>
                            </div>

                            {/* PT Ratio */}
                            <div className="grid grid-cols-2 gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">PT Primary (V)</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editPtPrimary}
                                        onChange={(e) => setEditPtPrimary(e.target.value)}
                                        className="w-full bg-slate-50 border-slate-200 text-slate-900 font-bold p-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </label>
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">PT Secondary (V)</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={editPtSecondary}
                                        onChange={(e) => setEditPtSecondary(e.target.value)}
                                        className="w-full bg-slate-50 border-slate-200 text-slate-900 font-bold p-2 text-sm rounded-lg border focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </label>
                            </div>

                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Meter Constant</span>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={editMeterConstant}
                                    onChange={(e) => setEditMeterConstant(e.target.value)}
                                    className="w-full bg-slate-50 border-slate-200 text-slate-900 font-bold p-2 rounded-lg border focus:ring-2 focus:ring-primary/20 outline-none"
                                />
                            </label>

                            <div className="grid grid-cols-2 gap-3">
                                <label className="flex flex-col gap-1">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Effective From</span>
                                    <input
                                        type="date"
                                        value={editEffectiveFrom}
                                        onChange={(e) => setEditEffectiveFrom(e.target.value)}
                                        className="w-full bg-slate-50 border-slate-200 text-slate-900 font-medium p-2 text-xs rounded-lg border outline-none"
                                    />
                                </label>
                                <div className="flex flex-col justify-end">
                                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-2 text-center">
                                        <span className="text-[10px] font-bold text-primary block">TOTAL FACTOR</span>
                                        <span className="text-sm font-black text-primary">
                                            ×{((parseFloat(editCtPrimary) || 0) / (parseFloat(editCtSecondary) || 1) * (parseFloat(editPtPrimary) || 0) / (parseFloat(editPtSecondary) || 1) * (parseFloat(editMeterConstant) || 0)).toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">Reason (Optional)</span>
                                <input
                                    type="text"
                                    value={editReason}
                                    onChange={(e) => setEditReason(e.target.value)}
                                    placeholder="e.g. CT Change"
                                    className="w-full bg-slate-50 border-slate-200 text-slate-900 font-medium p-2 text-sm rounded-lg border outline-none"
                                />
                            </label>
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveMultiplier}
                            disabled={isSavingMultiplier}
                            className="w-full py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition-colors disabled:opacity-50 mt-4 shadow-lg shadow-primary/20"
                        >
                            {isSavingMultiplier ? 'Saving...' : 'Save Configuration'}
                        </button>

                        {/* Delete Meter */}
                        <div className="pt-4 mt-4 border-t border-dashed border-gray-200">
                            <button
                                onClick={() => {
                                    if (window.confirm('Are you sure you want to delete this meter? This action cannot be undone.')) {
                                        onDelete?.(meter.id);
                                    }
                                }}
                                className="w-full py-3 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors bg-red-50 text-red-600 hover:bg-red-100"
                            >
                                <Trash2 className="w-4 h-4" />
                                Delete Meter
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Camera Capture Modal */}
            <CameraCaptureModal
                isOpen={showCameraModal}
                onClose={() => setShowCameraModal(false)}
                onCapture={handleCameraCapture}
                title={`Photo: ${meter.name}`}
            />
        </div>
    );
};

export default ElectricityLoggerCard;
