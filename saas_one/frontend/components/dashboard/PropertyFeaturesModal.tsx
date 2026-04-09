/**
 * PropertyFeaturesModal
 * Modal for enabling/disabling property-level module features.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect } from 'react';
import { X, Loader2, CheckCircle2, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface FeatureFlag {
    id?: string;
    feature_key: string;
    is_enabled: boolean;
    settings?: any;
}

interface Props {
    propertyId: string;
    propertyName: string;
    onClose: () => void;
}

const PropertyFeaturesModal: React.FC<Props> = ({ propertyId, propertyName, onClose }) => {
    const [features, setFeatures] = useState<FeatureFlag[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

    // Known features to manage
    const activeFeatures = [
        { key: 'ticket_validation', label: 'Ticket Validation', description: 'Require tenant approval before closing tickets' },
    ];

    useEffect(() => {
        fetchFeatures();
    }, [propertyId]);

    const fetchFeatures = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`/api/properties/${propertyId}/features`);
            if (response.ok) {
                const data = await response.json();
                setFeatures(data.features || []);
            }
        } catch (error) {
            console.error('Error fetching features:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleToggle = async (featureKey: string, currentStatus: boolean) => {
        try {
            const response = await fetch(`/api/properties/${propertyId}/features`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    feature_key: featureKey,
                    is_enabled: !currentStatus
                })
            });

            if (response.ok) {
                const { feature } = await response.json();
                setFeatures(prev => {
                    const exists = prev.find(f => f.feature_key === featureKey);
                    if (exists) {
                        return prev.map(f => f.feature_key === featureKey ? feature : f);
                    } else {
                        return [...prev, feature];
                    }
                });
                setMessage({ type: 'success', text: 'Settings updated' });
                setTimeout(() => setMessage(null), 3000);
            } else {
                setMessage({ type: 'error', text: 'Update failed' });
            }
        } catch (error) {
            console.error('Error toggling feature:', error);
            setMessage({ type: 'error', text: 'An error occurred' });
        }
    };

    const isEnabled = (key: string) => {
        const feature = features.find(f => f.feature_key === key);
        return feature ? feature.is_enabled : true;
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white rounded-[40px] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100"
            >
                <div className="px-10 py-8 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center text-white shadow-lg">
                            <Settings className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-slate-900 tracking-tight">Configure Property</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">{propertyName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-3 hover:bg-slate-200 rounded-full transition-colors group"
                    >
                        <X className="w-6 h-6 text-slate-400 group-hover:text-slate-900 transition-colors" />
                    </button>
                </div>

                <div className="p-10 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {/* Active Controls */}
                    <section className="mb-10">
                        <div className="flex items-center gap-2 mb-6 text-slate-400 pl-1">
                            <Settings className="w-4 h-4" />
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Operational Toggles</h4>
                        </div>

                        {isLoading ? (
                            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <p className="text-xs font-black uppercase tracking-widest">Accessing Registry...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {activeFeatures.map(item => {
                                    const active = isEnabled(item.key);
                                    return (
                                        <div key={item.key} className={`flex items-center justify-between p-6 rounded-[24px] border transition-all duration-300 ${active ? 'bg-white border-slate-200 shadow-sm' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                                            <div className="flex-1 pr-6">
                                                <p className="text-base font-black text-slate-900 mb-1">{item.label}</p>
                                                <p className="text-xs text-slate-400 font-medium leading-relaxed">{item.description}</p>
                                            </div>
                                            <button
                                                onClick={() => handleToggle(item.key, active)}
                                                className="focus:outline-none transition-transform active:scale-95"
                                            >
                                                {active ? (
                                                    <div className="w-14 h-7 bg-emerald-500 rounded-full relative transition-colors duration-300">
                                                        <div className="absolute right-1 top-1 w-5 h-5 bg-white rounded-full shadow-sm" />
                                                    </div>
                                                ) : (
                                                    <div className="w-14 h-7 bg-slate-200 rounded-full relative transition-colors duration-300">
                                                        <div className="absolute left-1 top-1 w-5 h-5 bg-white rounded-full shadow-sm" />
                                                    </div>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}

                            </div>
                        )}
                    </section>

                    <AnimatePresence>
                        {message && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 10 }}
                                className={`mt-8 p-4 rounded-2xl flex items-center justify-center gap-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {message.text}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                <div className="px-10 py-8 bg-slate-50/50 border-t border-slate-100 text-right">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-all shadow-lg active:scale-95"
                    >
                        Save Configuration
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

export default PropertyFeaturesModal;
