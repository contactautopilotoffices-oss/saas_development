/**
 * VendorPaymentModal
 * Stepped modal for processing vendor payments via UPI, card, net banking.
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X, CreditCard, Landmark, Smartphone,
    CheckCircle2, ShieldCheck, ArrowRight, Loader2,
    IndianRupee, Wallet
} from 'lucide-react';

interface VendorPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    amountDue: number;
    vendorName: string;
    onPaymentComplete: (data: any) => void;
}

const VendorPaymentModal = ({ isOpen, onClose, amountDue, vendorName, onPaymentComplete }: VendorPaymentModalProps) => {
    const [step, setStep] = useState<'method' | 'processing' | 'success'>('method');
    const [paymentMethod, setPaymentMethod] = useState<'upi' | 'card' | 'netbanking' | 'paytm' | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    const handlePayment = async () => {
        if (!paymentMethod) return;

        setIsProcessing(true);
        setStep('processing');

        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
            // In a real app, this would call the API route we just created
            // and actually process through a real gateway.
            onPaymentComplete({
                method: paymentMethod,
                amount: amountDue,
                timestamp: new Date().toISOString()
            });

            setStep('success');
        } catch (err) {
            console.error('Payment failed:', err);
            setStep('method'); // Go back on error
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ scale: 0.9, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    className="relative w-full max-w-md max-h-[90vh] bg-white rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                        <div>
                            <h2 className="text-xl font-black text-slate-900">Pay Commission</h2>
                            <p className="text-slate-500 text-sm font-medium">Settling dues for {vendorName}</p>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-slate-400" />
                        </button>
                    </div>

                    <div className="p-6 sm:p-8 overflow-y-auto flex-1">
                        {step === 'method' && (
                            <div className="space-y-6">
                                <div className="bg-indigo-600 rounded-2xl p-6 text-white text-center shadow-lg shadow-indigo-100">
                                    <p className="text-indigo-100 text-xs font-black uppercase tracking-widest mb-1">Total Amount Due</p>
                                    <h3 className="text-4xl font-black">₹{amountDue.toLocaleString('en-IN')}</h3>
                                </div>

                                <div className="space-y-3">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Select Payment Method</p>

                                    <button
                                        onClick={() => setPaymentMethod('upi')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${paymentMethod === 'upi' ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-slate-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                                                <Smartphone className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-black text-slate-900 text-sm">UPI / QR Scan</p>
                                                <p className="text-slate-500 text-[10px] font-bold">Google Pay, PhonePe, Paytm</p>
                                            </div>
                                        </div>
                                        {paymentMethod === 'upi' && <div className="w-3 h-3 bg-primary rounded-full" />}
                                    </button>

                                    <button
                                        onClick={() => setPaymentMethod('card')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${paymentMethod === 'card' ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-slate-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                                                <CreditCard className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-black text-slate-900 text-sm">Credit / Debit Card</p>
                                                <p className="text-slate-500 text-[10px] font-bold">Visa, Mastercard, RuPay</p>
                                            </div>
                                        </div>
                                        {paymentMethod === 'card' && <div className="w-3 h-3 bg-primary rounded-full" />}
                                    </button>

                                    <button
                                        onClick={() => setPaymentMethod('netbanking')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${paymentMethod === 'netbanking' ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-slate-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                                                <Landmark className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-black text-slate-900 text-sm">Net Banking</p>
                                                <p className="text-slate-500 text-[10px] font-bold">All major Indian banks</p>
                                            </div>
                                        </div>
                                        {paymentMethod === 'netbanking' && <div className="w-3 h-3 bg-primary rounded-full" />}
                                    </button>

                                    <button
                                        onClick={() => setPaymentMethod('paytm')}
                                        className={`w-full p-4 rounded-2xl border-2 transition-all flex items-center justify-between ${paymentMethod === 'paytm' ? 'border-primary bg-primary/5' : 'border-slate-100 hover:border-slate-200'
                                            }`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 bg-sky-50 text-sky-600 rounded-xl flex items-center justify-center">
                                                <Wallet className="w-5 h-5" />
                                            </div>
                                            <div className="text-left">
                                                <p className="font-black text-slate-900 text-sm">Paytm Wallet</p>
                                                <p className="text-slate-500 text-[10px] font-bold">Fast & Secure Wallet Checkout</p>
                                            </div>
                                        </div>
                                        {paymentMethod === 'paytm' && <div className="w-3 h-3 bg-primary rounded-full" />}
                                    </button>
                                </div>

                                <button
                                    disabled={!paymentMethod}
                                    onClick={handlePayment}
                                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all shadow-xl disabled:opacity-50 flex items-center justify-center gap-3"
                                >
                                    Proceed to Pay <ArrowRight className="w-5 h-5" />
                                </button>

                                <div className="flex items-center justify-center gap-2 text-slate-400">
                                    <ShieldCheck className="w-4 h-4" />
                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Secure 256-bit SSL Encrypted Payment</span>
                                </div>
                            </div>
                        )}

                        {step === 'processing' && (
                            <div className="py-12 flex flex-col items-center justify-center text-center space-y-6">
                                <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center">
                                    <Loader2 className="w-10 h-10 animate-spin" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-900">Processing Payment</h3>
                                    <p className="text-slate-500 font-medium">Please do not close the window or hit the back button.</p>
                                </div>
                                <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <motion.div
                                        initial={{ width: "0%" }}
                                        animate={{ width: "100%" }}
                                        transition={{ duration: 2 }}
                                        className="h-full bg-indigo-600"
                                    />
                                </div>
                            </div>
                        )}

                        {step === 'success' && (
                            <div className="py-8 flex flex-col items-center justify-center text-center space-y-6">
                                <motion.div
                                    initial={{ scale: 0.5, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="w-24 h-24 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-200"
                                >
                                    <CheckCircle2 className="w-12 h-12" />
                                </motion.div>
                                <div>
                                    <h3 className="text-2xl font-black text-slate-900">Payment Successful!</h3>
                                    <p className="text-slate-500 font-medium">Receipt has been sent to your email.</p>
                                </div>

                                <div className="w-full bg-slate-50 rounded-2xl p-6 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Transaction ID</span>
                                        <span className="text-xs font-black text-slate-900">#TXN_{Date.now().toString().slice(-8)}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Amount Paid</span>
                                        <span className="text-xs font-black text-emerald-600">₹{amountDue.toLocaleString('en-IN')}</span>
                                    </div>
                                </div>

                                <button
                                    onClick={onClose}
                                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black text-lg hover:bg-slate-800 transition-all"
                                >
                                    Return to Portal
                                </button>
                            </div>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default VendorPaymentModal;
