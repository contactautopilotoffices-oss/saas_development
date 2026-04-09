'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { ArrowRight, Eye, EyeOff, Lock, CheckCircle2, KeyRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import Loader from '@/frontend/components/ui/Loader';

function ResetPasswordContent() {
    const router = useRouter();
    const supabase = React.useMemo(() => createClient(), []);

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sessionReady, setSessionReady] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);

    useEffect(() => {
        const checkSession = async () => {
            try {
                // The auth callback has already exchanged the PKCE code and set the session
                // We just need to read the existing session from cookies
                const { data: { session } } = await supabase.auth.getSession();

                if (session) {
                    console.log('Recovery session found');
                    setSessionReady(true);
                } else {
                    setError('No active reset session found. Please request a new password reset link.');
                }
            } catch (err: any) {
                console.error('Session check error:', err);
                setError('Something went wrong. Please request a new reset link.');
            } finally {
                setCheckingSession(false);
            }
        };

        checkSession();
    }, [supabase]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (password.length < 6) {
            setError('Password must be at least 6 characters long.');
            setLoading(false);
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            setLoading(false);
            return;
        }

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;

            // Sign out to force re-login with new password
            await supabase.auth.signOut();
            setSuccess(true);
        } catch (err: any) {
            console.error('Password update error:', err);
            if (err.message?.includes('same_password')) {
                setError('New password must be different from your current password.');
            } else {
                setError(err.message || 'Failed to update password. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    // Loading state while checking session
    if (checkingSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <Loader size="lg" text="Verifying reset link..." />
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 font-body overflow-hidden relative bg-background">
            {/* Subtle grid pattern background */}
            <div className="absolute inset-0 opacity-30">
                <div className="absolute inset-0" style={{
                    backgroundImage: `linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)`,
                    backgroundSize: '48px 48px'
                }} />
            </div>

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

                    {success ? (
                        /* Success State */
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.3 }}
                            className="text-center py-4"
                        >
                            <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-success/20">
                                <CheckCircle2 className="w-10 h-10 text-success" />
                            </div>
                            <h2 className="text-2xl font-display font-bold text-text-primary mb-3">
                                Password Updated!
                            </h2>
                            <p className="text-text-secondary font-body mb-8 text-sm">
                                Your password has been changed successfully. Please sign in with your new password.
                            </p>
                            <button
                                onClick={() => router.push('/login')}
                                className="w-full bg-secondary hover:bg-secondary-dark text-text-inverse font-semibold py-3 rounded-[var(--radius-md)] shadow-sm transition-smooth flex items-center justify-center gap-2 group border border-secondary-dark"
                            >
                                Go to Sign In
                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-smooth" />
                            </button>
                        </motion.div>
                    ) : (
                        /* Password Form */
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25 }}
                        >
                            <div className="text-center mb-8">
                                <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/20">
                                    <KeyRound className="w-7 h-7 text-primary" />
                                </div>
                                <h1 className="text-2xl lg:text-3xl font-display font-bold text-text-primary mb-2">
                                    Set New Password
                                </h1>
                                <p className="text-text-secondary font-body text-sm">
                                    Create a strong password to secure your account
                                </p>
                            </div>

                            <form className="space-y-5" onSubmit={handleSubmit}>
                                {/* New Password */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-text-primary font-body flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-text-tertiary" />
                                        New Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            placeholder="Enter new password (min 6 characters)"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            disabled={!sessionReady}
                                            className="w-full h-11 px-4 pr-10 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary focus:outline-none transition-smooth"
                                        >
                                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm Password */}
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-text-primary font-body flex items-center gap-2">
                                        <Lock className="w-4 h-4 text-text-tertiary" />
                                        Confirm Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showConfirmPassword ? "text" : "password"}
                                            placeholder="Confirm your new password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            required
                                            disabled={!sessionReady}
                                            className="w-full h-11 px-4 pr-10 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary focus:outline-none transition-smooth"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                        </button>
                                    </div>
                                    {/* Password match indicator */}
                                    {confirmPassword && (
                                        <p className={`text-xs font-medium ${password === confirmPassword ? 'text-success' : 'text-error'}`}>
                                            {password === confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                                        </p>
                                    )}
                                </div>

                                {/* Error / Info Messages */}
                                {error && (
                                    <div className="p-3 bg-error/10 text-error text-sm font-semibold rounded-[var(--radius-md)] border border-error/20">
                                        {error}
                                    </div>
                                )}

                                {!sessionReady && !error && (
                                    <div className="p-3 bg-warning/10 text-warning text-sm font-semibold rounded-[var(--radius-md)] border border-warning/20">
                                        No active session. Please click the reset link from your email.
                                    </div>
                                )}

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={loading || !sessionReady}
                                    className="w-full bg-secondary hover:bg-secondary-dark text-text-inverse font-semibold py-3 rounded-[var(--radius-md)] shadow-sm transition-smooth flex items-center justify-center gap-2 group border border-secondary-dark disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loading ? (
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            Update Password
                                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-smooth" />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Request new link */}
                            <div className="mt-6 text-center space-y-2">
                                <button
                                    onClick={() => router.push('/forgot-password')}
                                    className="text-sm text-primary font-semibold hover:underline transition-smooth"
                                >
                                    Request a new reset link
                                </button>
                                <div>
                                    <button
                                        onClick={() => router.push('/login')}
                                        className="text-xs text-text-tertiary hover:text-text-secondary transition-smooth"
                                    >
                                        ← Back to Sign In
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>
            </motion.div>
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader size="lg" text="Loading..." /></div>}>
            <ResetPasswordContent />
        </Suspense>
    );
}
