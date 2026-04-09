'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { ArrowRight, Mail, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/frontend/context/AuthContext';
import Loader from '@/frontend/components/ui/Loader';

function ForgotPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { resetPassword } = useAuth();

    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPopup, setShowPopup] = useState(false);

    // Handle error from callback redirect (e.g., expired link)
    useEffect(() => {
        const urlError = searchParams.get('error');
        if (urlError === 'link_expired') {
            setError('Your password reset link has expired. Please request a new one.');
            // Clean the URL
            window.history.replaceState(null, '', '/forgot-password');
        }
    }, [searchParams]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Use the AuthContext's resetPassword which calls supabase.auth.resetPasswordForEmail directly
            await resetPassword(email);
            setShowPopup(true);

            // Auto-hide popup after 8 seconds
            setTimeout(() => {
                setShowPopup(false);
            }, 8000);
        } catch (err: any) {
            console.error('Forgot password error:', err);
            if (err.message?.includes('rate limit')) {
                setError('Too many requests. Please wait a few minutes before trying again.');
            } else if (err.message?.includes('not found')) {
                // Don't reveal if email exists or not for security
                setShowPopup(true);
                setTimeout(() => setShowPopup(false), 8000);
            } else {
                setError(err.message || 'Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 font-body overflow-hidden relative bg-background">
            {/* Subtle grid pattern background */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0" style={{
                    backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
                    backgroundSize: '48px 48px'
                }} />
            </div>

            {/* Success Popup / Toast */}
            <AnimatePresence>
                {showPopup && (
                    <motion.div
                        initial={{ opacity: 0, y: -40, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -40, scale: 0.95 }}
                        transition={{ duration: 0.35, ease: [0.4, 0.0, 0.2, 1] }}
                        className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-md"
                    >
                        <div className="bg-surface border border-success/30 rounded-[var(--radius-lg)] shadow-2xl p-5 flex items-start gap-4">
                            <div className="w-11 h-11 bg-success/10 rounded-full flex items-center justify-center flex-shrink-0 border border-success/20">
                                <CheckCircle2 className="w-6 h-6 text-success" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-sm font-bold text-text-primary mb-1">Reset Link Sent!</h3>
                                <p className="text-xs text-text-secondary leading-relaxed">
                                    A password reset link has been sent to{' '}
                                    <span className="font-semibold text-text-primary break-all">{email}</span>.
                                    Please check your inbox and spam folder.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowPopup(false)}
                                className="text-text-tertiary hover:text-text-secondary transition-smooth text-lg leading-none mt-0.5"
                            >
                                ✕
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
                className="relative z-10 enterprise-card w-full max-w-md overflow-hidden bg-surface"
            >
                <div className="p-8 lg:p-10">
                    {/* Logo */}
                    <div className="flex items-center justify-center mb-6">
                        <Image
                            src="/autopilot-logo-new.png"
                            alt="Autopilot Logo"
                            width={200}
                            height={70}
                            className="object-contain dark:invert transition-smooth"
                        />
                    </div>

                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25 }}
                    >
                        <div className="text-center mb-8">
                            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
                                <Mail className="w-7 h-7 text-primary" />
                            </div>
                            <h1 className="text-2xl lg:text-3xl font-display font-bold text-text-primary mb-2">
                                Forgot Password?
                            </h1>
                            <p className="text-text-secondary font-body text-sm">
                                No worries! Enter your email and we&apos;ll send you a reset link
                            </p>
                        </div>

                        <form className="space-y-5" onSubmit={handleSubmit}>
                            <div className="space-y-2">
                                <label className="text-sm font-semibold text-text-primary font-body flex items-center gap-2">
                                    <Mail className="w-4 h-4 text-text-tertiary" />
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    placeholder="Enter your registered email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    className="w-full h-11 px-4 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-error/10 text-error text-sm font-semibold rounded-[var(--radius-md)] border border-error/20">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full bg-secondary hover:bg-secondary-dark text-text-inverse font-semibold py-3 rounded-[var(--radius-md)] shadow-sm transition-smooth flex items-center justify-center gap-2 group border border-secondary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {loading ? (
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        Send Reset Link
                                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-smooth" />
                                    </>
                                )}
                            </button>
                        </form>

                        {/* Back to Login */}
                        <div className="mt-6 text-center">
                            <button
                                onClick={() => router.push('/login')}
                                className="text-sm text-primary font-semibold hover:underline transition-smooth inline-flex items-center gap-1"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Sign In
                            </button>
                        </div>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}

export default function ForgotPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader size="lg" text="Loading..." /></div>}>
            <ForgotPasswordContent />
        </Suspense>
    );
}
