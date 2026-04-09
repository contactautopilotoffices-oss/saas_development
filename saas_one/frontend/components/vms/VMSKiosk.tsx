/**
 * VMSKiosk - Self-service visitor management system (VMS) kiosk interface.
 *
 * Provides a full-screen, touch-friendly interface for visitor check-in and check-out at
 * a property. Supports three visitor categories (Visitor, Vendor, Other). The multi-step
 * flow includes: home screen, category selection, visitor form (name, mobile with +91 prefix,
 * coming from, host autocomplete, optional custom visitor ID, and photo capture via
 * CameraCapture), check-in confirmation with auto-generated visitor ID, and checkout
 * by entering the visitor ID. Auto-resets to home after 30 seconds of inactivity on
 * success screens. Integrates with `/api/vms/{propertyId}` for check-in/checkout and
 * `/api/vms/{propertyId}/photos` for photo upload to Supabase Storage.
 *
 * @example
 * <VMSKiosk propertyId="prop-123" propertyName="Apex Tower" />
 */
'use client';

import React, { useState, useEffect } from 'react';
import { X, User, Truck, Building2, ArrowRight, ArrowLeft, LogIn, LogOut, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import CameraCapture from './CameraCapture';
import HostAutoComplete from './HostAutoComplete';

interface VMSKioskProps {
    propertyId: string;
    propertyName: string;
}

type Category = 'visitor' | 'vendor' | 'other';
type KioskStep = 'home' | 'category' | 'form' | 'success' | 'checkout' | 'checkout_success';

interface FormData {
    name: string;
    mobile: string;
    coming_from: string;
    whom_to_meet: string;
    photo_url: string;
}

const VMSKiosk: React.FC<VMSKioskProps> = ({ propertyId, propertyName }) => {
    return (
        <div className="fixed inset-0 sm:relative sm:min-h-[700px] w-full h-full overflow-hidden">
            <VMSKioskContent propertyId={propertyId} propertyName={propertyName} />
        </div>
    );
};

const VMSKioskContent: React.FC<VMSKioskProps> = ({ propertyId, propertyName }) => {
    const [step, setStep] = useState<KioskStep>('home');
    const [category, setCategory] = useState<Category>('visitor');
    const [formData, setFormData] = useState<FormData>({
        name: '',
        mobile: '',
        coming_from: '',
        whom_to_meet: '',
        photo_url: '',
    });
    const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
    const [visitorId, setVisitorId] = useState('');
    const [customVisitorId, setCustomVisitorId] = useState('');
    const [checkoutId, setCheckoutId] = useState('');
    const [checkoutName, setCheckoutName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Reset to home after 30 seconds of inactivity on success screens
    useEffect(() => {
        if (step === 'success' || step === 'checkout_success') {
            const timer = setTimeout(() => resetKiosk(), 30000);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const resetKiosk = () => {
        setStep('home');
        setCategory('visitor');
        setFormData({ name: '', mobile: '', coming_from: '', whom_to_meet: '', photo_url: '' });
        setPhotoBlob(null);
        setVisitorId('');
        setCustomVisitorId('');
        setCheckoutId('');
        setCheckoutName('');
        setError('');
    };

    const handlePhotoCapture = (imageUrl: string, blob: Blob) => {
        setFormData(prev => ({ ...prev, photo_url: imageUrl }));
        setPhotoBlob(blob);
    };

    const handleCheckin = async () => {
        if (!formData.name || !formData.whom_to_meet) {
            setError('Please fill all required fields');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            // First create visitor log (without photo)
            const response = await fetch(`/api/vms/${propertyId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    category,
                    name: formData.name,
                    mobile: formData.mobile ? `+91${formData.mobile}` : null,
                    coming_from: formData.coming_from,
                    whom_to_meet: formData.whom_to_meet,
                    visitor_id: customVisitorId.trim() || null,
                    photo_url: null, // Will be updated after upload
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Check-in failed');
            }

            // Upload photo to Supabase Storage if exists
            if (photoBlob && data.visitor_id) {
                const photoFormData = new FormData();
                photoFormData.append('file', photoBlob, `${data.visitor_id}.webp`);
                photoFormData.append('visitor_id', data.visitor_id);

                await fetch(`/api/vms/${propertyId}/photos`, {
                    method: 'POST',
                    body: photoFormData,
                }).catch(console.error); // Non-blocking
            }

            setVisitorId(data.visitor_id);
            setStep('success');
        } catch (err: any) {
            console.error('Check-in error:', err);
            setError(err.message || 'Failed to check in. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCheckout = async () => {
        if (!checkoutId) {
            setError('Please enter your Visitor ID');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            const response = await fetch(`/api/vms/${propertyId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ visitor_id: checkoutId }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Check-out failed');
            }

            setCheckoutName(data.visitor?.name || 'Visitor');
            setStep('checkout_success');
        } catch (err: any) {
            console.error('Check-out error:', err);
            setError(err.message || 'Visitor ID not found. Please check and try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (step === 'home') {
        return (
            <div className="h-full w-full bg-[#ebf5f4] relative flex flex-col items-center justify-center overflow-hidden sm:p-8 sm:rounded-[2.5rem]">
                {/* Brand Mesh Gradient Background */}
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[100px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[#ebf5f4]/80" />
                </div>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white sm:rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-6 sm:p-10 w-full h-full sm:h-auto sm:max-w-md relative z-10 border border-white/10 flex flex-col justify-center"
                >
                    <div className="text-center mb-6 sm:mb-12">
                        <div className="w-14 h-14 sm:w-20 sm:h-20 bg-primary rounded-3xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-xl shadow-primary/20 rotate-3">
                            <User className="w-7 h-7 sm:w-10 sm:h-10 text-white -rotate-3" />
                        </div>
                        <h1 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-widest leading-tight">Visitor Management</h1>
                        <p className="text-slate-400 font-bold mt-2 flex items-center justify-center gap-2 text-xs sm:text-sm">
                            <span className="w-1.5 h-1.5 bg-secondary rounded-full animate-pulse" />
                            {propertyName}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => setStep('category')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-emerald-500 hover:bg-emerald-600 text-white rounded-[1.5rem] transition-all shadow-lg shadow-emerald-500/20 active:scale-95 group"
                        >
                            <LogIn className="w-8 h-8 sm:w-10 sm:h-10 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-xl font-black tracking-tight">IN</span>
                        </button>
                        <button
                            onClick={() => setStep('checkout')}
                            className="flex flex-col items-center justify-center p-6 sm:p-8 bg-rose-500 hover:bg-rose-600 text-white rounded-[1.5rem] transition-all shadow-lg shadow-rose-500/20 active:scale-95 group"
                        >
                            <LogOut className="w-8 h-8 sm:w-10 sm:h-10 mb-2 group-hover:scale-110 transition-transform" />
                            <span className="text-xl font-black tracking-tight">OUT</span>
                        </button>
                    </div>
                </motion.div>
            </div>
        );
    }

    // CATEGORY SELECTION
    if (step === 'category') {
        return (
            <div className="h-full w-full bg-[#ebf5f4] relative flex flex-col items-center justify-center overflow-hidden sm:p-8 sm:rounded-[2.5rem]">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[100px]" />
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[#ebf5f4]/80" />
                </div>
                <div className="bg-white sm:rounded-3xl shadow-2xl p-6 sm:p-8 w-full h-full sm:h-auto sm:max-w-md relative z-10 flex flex-col overflow-y-auto">
                    <button
                        onClick={() => setStep('home')}
                        className="flex items-center gap-2 text-slate-700 hover:text-slate-900 mb-4 sm:mb-6 text-sm sm:text-base font-medium transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" /> Back
                    </button>

                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-4 sm:mb-6 text-center leading-tight">Select Category</h2>

                    <div className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
                        {[
                            { id: 'visitor', label: 'Visitor', icon: User, color: 'bg-primary', desc: 'General visitor' },
                            { id: 'vendor', label: 'Vendor', icon: Truck, color: 'bg-secondary', desc: 'Delivery or service' },
                            { id: 'other', label: 'Other', icon: Building2, color: 'bg-slate-500', desc: 'Interview, meeting, etc.' },
                        ].map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => setCategory(cat.id as Category)}
                                className={`w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border-2 transition-all ${category === cat.id
                                    ? 'border-indigo-500 bg-indigo-50'
                                    : 'border-slate-100 hover:border-slate-200'
                                    }`}
                            >
                                <div className={`w-10 h-10 sm:w-12 sm:h-12 ${cat.color} rounded-xl flex items-center justify-center text-white shrink-0`}>
                                    <cat.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                                </div>
                                <div className="text-left">
                                    <p className="font-bold text-sm sm:text-base text-slate-900">{cat.label}</p>
                                    <p className="text-[10px] sm:text-xs text-slate-400">{cat.desc}</p>
                                </div>
                                {category === cat.id && (
                                    <Check className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 ml-auto" />
                                )}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={() => setStep('form')}
                        className="w-full py-3.5 sm:py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all shadow-lg shadow-primary/20 text-sm sm:text-base"
                    >
                        Continue <ArrowRight className="w-5 h-5" />
                    </button>
                </div>
            </div>
        );
    }

    // VISITOR FORM
    if (step === 'form') {
        return (
            <div className="h-full w-full bg-[#ebf5f4] relative flex flex-col items-center justify-center overflow-hidden sm:p-8 sm:rounded-[2.5rem]">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-[100px]" />
                </div>
                <div className="bg-white sm:rounded-[2rem] shadow-2xl p-5 sm:p-8 w-full h-full sm:max-w-md sm:max-h-[92vh] overflow-y-auto relative z-10">
                    <button
                        onClick={() => setStep('category')}
                        className="flex items-center gap-2 text-slate-700 hover:text-slate-900 mb-4 sm:mb-6 text-sm sm:text-base font-medium transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                        Back
                    </button>

                    <h2 className="text-lg sm:text-xl font-black text-slate-900 mb-4 sm:mb-6 leading-tight">Visitor Form</h2>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-600 p-2.5 rounded-xl mb-3 text-[11px] sm:text-sm">
                            {error}
                        </div>
                    )}

                    <div className="space-y-3 sm:space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div>
                                <label className="block text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">
                                    Name *
                                </label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    placeholder="Full name"
                                    className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 font-medium text-sm sm:text-base focus:border-indigo-500 focus:ring-0 transition-colors"
                                />
                            </div>

                            <div>
                                <label className="block text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">
                                    Mobile
                                </label>
                                <div className="flex rounded-2xl overflow-hidden border border-slate-200 focus-within:border-indigo-500 transition-colors">
                                    <span className="px-2 sm:px-3 py-2.5 sm:py-3 bg-slate-100 border-r border-slate-200 text-slate-500 font-medium text-xs sm:text-sm shrink-0">
                                        +91
                                    </span>
                                    <input
                                        type="tel"
                                        value={formData.mobile}
                                        onChange={(e) => setFormData(prev => ({ ...prev, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                                        placeholder="10 digit"
                                        className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-50 text-slate-900 font-medium text-sm sm:text-base focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">
                                Coming From
                            </label>
                            <input
                                type="text"
                                value={formData.coming_from}
                                onChange={(e) => setFormData(prev => ({ ...prev, coming_from: e.target.value }))}
                                placeholder="Company or address"
                                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-medium text-sm sm:text-base focus:border-indigo-500 focus:ring-0 transition-colors"
                            />
                        </div>

                        <div>
                            <label className="block text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-1.5">
                                Visitor ID (Optional / Custom)
                            </label>
                            <input
                                type="text"
                                value={customVisitorId}
                                onChange={(e) => setCustomVisitorId(e.target.value.toUpperCase())}
                                placeholder="Any ID or leave for auto"
                                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-black text-sm sm:text-base focus:border-indigo-500 focus:ring-0 transition-colors tracking-widest"
                            />
                        </div>

                        <HostAutoComplete
                            propertyId={propertyId}
                            value={formData.whom_to_meet}
                            onChange={(value) => setFormData(prev => ({ ...prev, whom_to_meet: value }))}
                        />

                        {/* Camera */}
                        <div className="pt-2 sm:pt-4">
                            <label className="block text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 sm:mb-3 text-center">
                                Capture Photo
                            </label>
                            {formData.photo_url ? (
                                <div className="flex flex-col items-center">
                                    <img
                                        src={formData.photo_url}
                                        alt="Visitor"
                                        className="w-24 h-32 sm:w-32 sm:h-40 object-cover rounded-xl border-2 border-emerald-500 mb-2"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setFormData(prev => ({ ...prev, photo_url: '' }))}
                                        className="text-[10px] sm:text-sm text-slate-500 hover:text-slate-700 font-bold uppercase tracking-tighter"
                                    >
                                        Change Photo
                                    </button>
                                </div>
                            ) : (
                                <CameraCapture onCapture={handlePhotoCapture} />
                            )}
                        </div>
                    </div>

                    <button
                        onClick={handleCheckin}
                        disabled={isSubmitting || !formData.name || !formData.whom_to_meet}
                        className="w-full py-3.5 sm:py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black mt-4 sm:mt-6 flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-primary/20 text-sm sm:text-base"
                    >
                        {isSubmitting ? (
                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <Check className="w-5 h-5" /> Confirm
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // CHECK-IN SUCCESS
    if (step === 'success') {
        return (
            <div className="h-full w-full bg-emerald-600 relative flex flex-col items-center justify-center sm:p-8 overflow-hidden sm:rounded-[2.5rem] text-white">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-white/20 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/10 rounded-full blur-[100px]" />
                </div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center relative z-10 w-full h-full flex flex-col items-center justify-center p-6"
                >
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Check className="w-12 h-12" />
                    </div>
                    <h1 className="text-3xl font-black mb-2">Welcome, {formData.name}!</h1>
                    <p className="text-emerald-100 text-lg mb-8">Your visit has been logged.</p>

                    <div className="bg-white/10 rounded-2xl p-6 mb-8">
                        <p className="text-sm text-emerald-100 mb-1">Your Visitor ID</p>
                        <p className="text-4xl font-black tracking-wider">{visitorId}</p>
                    </div>

                    <p className="text-emerald-100 text-sm mb-4">Please remember this ID for check-out.</p>

                    <button
                        onClick={resetKiosk}
                        className="px-8 py-3 bg-white text-emerald-600 rounded-xl font-black hover:bg-emerald-50 transition-all"
                    >
                        Done
                    </button>
                </motion.div>
            </div>
        );
    }

    // CHECKOUT SCREEN
    if (step === 'checkout') {
        return (
            <div className="h-full w-full bg-[#ebf5f4] relative flex flex-col items-center justify-center sm:p-8 overflow-hidden sm:rounded-[2.5rem]">
                <div className="absolute inset-0 z-0">
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-rose-500/10 rounded-full blur-[100px]" />
                </div>
                <div className="bg-white sm:rounded-[2rem] shadow-2xl p-6 sm:p-10 w-full h-full sm:h-auto sm:max-w-md relative z-10 flex flex-col justify-center">
                    <button
                        onClick={() => setStep('home')}
                        className="flex items-center gap-2 text-slate-700 hover:text-slate-900 mb-4 sm:mb-6 text-sm sm:text-base font-medium transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" /> Back
                    </button>

                    <h2 className="text-xl sm:text-2xl font-black text-slate-900 mb-4 sm:mb-6 text-center leading-tight">Visitor Check-Out</h2>

                    {error && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-600 p-3 rounded-xl mb-4 text-xs sm:text-sm">
                            {error}
                        </div>
                    )}

                    <div className="mb-4 sm:mb-6">
                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                            Enter Visitor ID
                        </label>
                        <input
                            type="text"
                            value={checkoutId}
                            onChange={(e) => setCheckoutId(e.target.value.toUpperCase())}
                            placeholder="e.g., PROP-00123"
                            className="w-full px-4 py-3 sm:py-4 bg-slate-50 border-2 border-slate-200 rounded-xl text-slate-900 font-bold text-base sm:text-lg text-center tracking-wider focus:border-rose-500 focus:ring-0 transition-colors"
                        />
                    </div>

                    <button
                        onClick={handleCheckout}
                        disabled={isSubmitting || !checkoutId}
                        className="w-full py-3.5 sm:py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all disabled:opacity-50 text-sm sm:text-base shadow-lg shadow-rose-500/20"
                    >
                        {isSubmitting ? (
                            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <LogOut className="w-4 h-4 sm:w-5 sm:h-5" /> OUT
                            </>
                        )}
                    </button>
                </div>
            </div>
        );
    }

    // CHECKOUT SUCCESS
    if (step === 'checkout_success') {
        return (
            <div className="h-full w-full bg-rose-500 relative flex flex-col items-center justify-center sm:p-8 overflow-hidden sm:rounded-[2.5rem] text-white">
                <div className="absolute inset-0 z-0">
                    <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-white/20 rounded-full blur-[100px]" />
                    <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-white/10 rounded-full blur-[100px]" />
                </div>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-center relative z-10 w-full h-full flex flex-col items-center justify-center p-6"
                >
                    <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <LogOut className="w-12 h-12" />
                    </div>
                    <h1 className="text-3xl font-black mb-2">Goodbye, {checkoutName}!</h1>
                    <p className="text-rose-100 text-lg mb-8">Your visit has been completed.</p>

                    <button
                        onClick={resetKiosk}
                        className="px-8 py-3 bg-white text-rose-600 rounded-xl font-black hover:bg-rose-50 transition-all"
                    >
                        Done
                    </button>
                </motion.div>
            </div>
        );
    }

    return null;
};

export default VMSKiosk;
