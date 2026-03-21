'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { ArrowRight, Sparkles, Building2, BarChart3, Ticket, Eye, EyeOff, Lock, Mail, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/frontend/context/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/frontend/utils/supabase/client';
import Loader from '@/frontend/components/ui/Loader';

// Feature cards for the animated showcase
const features = [
    {
        id: 1,
        title: 'Smart Ticketing',
        subtitle: 'AI-powered resolution',
        stat: '95%',
        statLabel: 'Faster Resolution',
        icon: Ticket,
        color: 'from-emerald-400 to-teal-500'
    }
];

function AuthContent() {
    const searchParams = useSearchParams();
    const initialMode = searchParams.get('mode');
    const urlError = searchParams.get('error');
    const redirectPath = searchParams.get('redirect');

    const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'forgot' | 'reset-success' | 'update-password'>(
        initialMode === 'signup' ? 'signup' :
            initialMode === 'reset' ? 'update-password' : 'signin'
    );

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [loading, setLoading] = useState(false);
    const [currentFeature, setCurrentFeature] = useState(0);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    const { signIn, signUp, signInWithGoogle, signInWithApple, resetPassword, signOut } = useAuth();
    const router = useRouter();

    // Memoize supabase client to prevent re-creation on every render
    const supabase = React.useMemo(() => createClient(), []);

    // Handle URL error parameters (from middleware redirects or callback errors)
    useEffect(() => {
        if (urlError) {
            const errorMessages: Record<string, string> = {
                'auth_failed': 'Authentication failed. Please try again.',
                'no_access': 'Your account is not assigned to any organization or property. Please contact your administrator.',
                'session_expired': 'Your session has expired. Please sign in again.',
                'unauthorized': 'You are not authorized to access that page.',
            };
            setError(errorMessages[urlError] || 'An error occurred. Please try again.');
            // Clear the error from URL to prevent showing it again on refresh
            window.history.replaceState(null, '', window.location.pathname);
        }
    }, [urlError]);

    // Handle password reset token from URL (Supabase may use hash fragment OR code param)
    useEffect(() => {
        const handlePasswordResetSession = async () => {
            if (typeof window === 'undefined') return;

            // Method 1: Check URL hash for legacy token flow
            if (window.location.hash) {
                const hashParams = new URLSearchParams(window.location.hash.substring(1));
                const accessToken = hashParams.get('access_token');
                const refreshToken = hashParams.get('refresh_token');
                const type = hashParams.get('type');

                if (accessToken && type === 'recovery') {
                    console.log('Password reset token detected in hash, setting session...');

                    const { error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || '',
                    });

                    if (error) {
                        console.error('Failed to set recovery session:', error);
                        setError('Password reset link has expired. Please request a new one.');
                        setAuthMode('forgot');
                    } else {
                        console.log('Recovery session set successfully');
                        setAuthMode('update-password');
                        window.history.replaceState(null, '', window.location.pathname + '?mode=reset');
                    }
                    return;
                }
            }

            // Method 2: Check URL params for PKCE code flow  
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');
            const type = urlParams.get('type');

            if (code && type === 'recovery') {
                console.log('Password reset PKCE code detected, exchanging...');

                const { error } = await supabase.auth.exchangeCodeForSession(code);

                if (error) {
                    console.error('Failed to exchange recovery code:', error);
                    setError('Password reset link has expired or is invalid. Please request a new one.');
                    setAuthMode('forgot');
                } else {
                    console.log('Recovery code exchanged successfully');
                    setAuthMode('update-password');
                    window.history.replaceState(null, '', window.location.pathname + '?mode=reset');
                }
                return;
            }

            // Method 3: If mode=reset, check if we already have a valid session
            if (initialMode === 'reset') {
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    console.log('Already have session for password reset');
                    setAuthMode('update-password');
                } else {
                    console.log('No session found for password reset mode');
                    // Session might be loading, let Supabase handle it
                }
            }
        };

        handlePasswordResetSession();
    }, []); // Removed ALL dependencies to prevent loops -> only runs on mount

    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');

        try {
            if (authMode === 'signup') {
                const data = await signUp(email, password, fullName);

                if (data?.session) {
                    console.log('Signup successful, session found. Redirecting...');
                    router.push('/onboarding');
                } else if (data?.user) {
                    console.log('Signup successful, but no session. Email confirmation likely required.');
                    setSuccess('Account created! Please check your email inbox to verify your account before logging in.');
                    // Don't redirect if there's no session, as onboarding requires a logged-in user
                } else {
                    throw new Error('Signup failed to return user data.');
                }
            } else if (authMode === 'signin') {
                const { data: { user: authUser }, error: signInError } = await signIn(email, password);
                if (signInError || !authUser) throw new Error(signInError?.message || 'Login failed');

                // ✅ Step 1: Fetch user FIRST (and ONLY user)
                const { data: userProfile, error: profileError } = await supabase
                    .from('users')
                    .select('id, is_master_admin')
                    .eq('id', authUser.id)
                    .single();

                if (profileError || !userProfile) {
                    console.error('Profile fetch error:', profileError);
                    throw new Error('User profile not found.');
                }

                // ✅ Step 2: HARD SHORT-CIRCUIT for master admin
                if (userProfile.is_master_admin) {
                    if (redirectPath && redirectPath !== '/') {
                        router.replace(redirectPath);
                    } else {
                        router.replace('/master');
                    }
                    return;
                }

                // ✅ Step 3: Resolve organization membership
                // Industry pattern: fetch ALL org memberships (no role filter, handles any is_active state),
                // then pick the highest-priority one. Avoids maybeSingle() failure on multiple rows.
                const { data: orgMemberships } = await supabase
                    .from('organization_memberships')
                    .select('organization_id, role, is_active')
                    .eq('user_id', userProfile.id);

                // Only org-level roles should route to the org dashboard.
                // Property-level roles (property_admin, staff, tenant, etc.) may also have
                // an org_membership row (created by the user-create API), but they should
                // be routed via Step 4 (property_memberships) instead.
                const ORG_LEVEL_ROLES = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'org_admin'];
                const activeOrgMemberships = (orgMemberships || []).filter(
                    (m) => ORG_LEVEL_ROLES.includes(m.role) && (m.is_active === true || m.is_active === null)
                );

                if (activeOrgMemberships.length > 0) {
                    // Pick best by priority (org_super_admin first, then super_tenant, then others)
                    const ORG_PRIORITY = ['org_super_admin', 'super_tenant', 'owner', 'admin', 'member'];
                    const best = [...activeOrgMemberships].sort((a, b) => {
                        const ai = ORG_PRIORITY.indexOf(a.role) === -1 ? 99 : ORG_PRIORITY.indexOf(a.role);
                        const bi = ORG_PRIORITY.indexOf(b.role) === -1 ? 99 : ORG_PRIORITY.indexOf(b.role);
                        return ai - bi;
                    })[0];

                    router.replace(
                        redirectPath && redirectPath !== '/'
                            ? redirectPath
                            : `/org/${best.organization_id}/dashboard`
                    );
                    return;
                }

                // ✅ Step 4: Resolve property membership
                // Industry pattern: fetch ALL memberships, use first — never maybeSingle() on a
                // table where a user can have multiple rows (e.g. multi-property users).
                const { data: propMemberships } = await supabase
                    .from('property_memberships')
                    .select('property_id, organization_id, role, is_active')
                    .eq('user_id', userProfile.id)
                    .order('created_at', { ascending: false });

                const activePropMemberships = (propMemberships || []).filter(
                    (m) => m.is_active === true || m.is_active === null
                );

                const propMembership = activePropMemberships[0] ?? null;

                if (propMembership) {
                    if (redirectPath && redirectPath !== '/') {
                        router.replace(redirectPath);
                        return;
                    }

                    const role = propMembership.role;
                    const pId = propMembership.property_id;

                    if (role === 'property_admin') {
                        router.replace(`/property/${pId}/dashboard`);
                    } else if (role === 'tenant') {
                        router.replace(`/property/${pId}/tenant`);
                    } else if (role === 'security') {
                        router.replace(`/property/${pId}/security`);
                    } else if (role === 'staff') {
                        router.replace(`/property/${pId}/staff`);
                    } else if (role === 'mst') {
                        router.replace(`/property/${pId}/mst`);
                    } else if (role === 'vendor') {
                        router.replace(`/property/${pId}/vendor`);
                    } else {
                        router.replace(`/property/${pId}/dashboard`);
                    }
                    return;
                }

                /* Nothing found */
                await signOut();
                throw new Error(
                    'Your account is not assigned to any organization or property.'
                );
            } else if (authMode === 'forgot') {
                await resetPassword(email);
                setAuthMode('reset-success');
            } else if (authMode === 'update-password') {
                if (password !== confirmPassword) throw new Error('Passwords do not match');

                // First verify we have a valid session
                const { data: { session } } = await supabase.auth.getSession();

                if (!session) {
                    // Try to get session from onAuthStateChange
                    throw new Error('No active session. Please click the password reset link in your email again, or request a new one.');
                }

                const { error: updateError } = await supabase.auth.updateUser({
                    password: password
                });

                if (updateError) throw updateError;

                // Sign out after password change to force re-login with new password
                await supabase.auth.signOut();

                setSuccess('Password updated successfully! Please sign in with your new password.');
                setAuthMode('signin');
            }
        } catch (err: any) {
            console.error('Auth action error:', err);
            // Provide user-friendly error messages for common auth failures
            const errorMessage = err.message?.toLowerCase() || '';

            if (errorMessage.includes('invalid login credentials')) {
                setError('Invalid email or password. Please check your credentials and try again.');
            } else if (errorMessage.includes('email not confirmed')) {
                setError('Please verify your email address before signing in. Check your inbox for a verification link.');
            } else if (errorMessage.includes('user not found')) {
                setError('No account found with this email. Please sign up first.');
            } else if (errorMessage.includes('too many requests')) {
                setError('Too many login attempts. Please wait a few minutes before trying again.');
            } else if (errorMessage.includes('network')) {
                setError('Network error. Please check your internet connection and try again.');
            } else {
                setError(err.message || 'Something went wrong. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleAuth = async () => {
        try {
            await signInWithGoogle(undefined, redirectPath || undefined);
        } catch (err: any) {
            setError(err.message || 'Google sign-in failed.');
        }
    };

    const handleAppleAuth = async () => {
        try {
            await signInWithApple(undefined, redirectPath || undefined);
        } catch (err: any) {
            setError(err.message || 'Apple sign-in failed.');
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

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
                className="relative z-10 enterprise-card w-full max-w-5xl overflow-hidden flex flex-col lg:flex-row min-h-[680px]"
            >
                {/* Left Side - Auth Form */}
                <div className="w-full lg:w-1/2 p-8 lg:p-12 flex flex-col justify-start pt-6 lg:pt-8 bg-surface">
                    {/* Logo */}
                    <div className="flex items-center gap-2 mb-4 -mt-[10px]">
                        <Image
                            src="/autopilot-logo-new.png"
                            alt="Autopilot Logo"
                            width={260}
                            height={90}
                            className="object-contain dark:invert transition-smooth"
                        />
                    </div>

                    <AnimatePresence mode="wait">
                        {authMode === 'reset-success' ? (
                            <motion.div
                                key="reset-success"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.05 }}
                                transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
                                className="text-center py-8"
                            >
                                <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-success/20">
                                    <Mail className="w-10 h-10 text-success" />
                                </div>
                                <h2 className="text-3xl font-display font-bold text-text-primary mb-4">Check your email</h2>
                                <p className="text-text-secondary font-body mb-8">
                                    We've sent a password reset link to <span className="text-text-primary font-semibold">{email}</span>.
                                </p>
                                <button
                                    onClick={() => setAuthMode('signin')}
                                    className="text-primary font-semibold hover:underline transition-smooth"
                                >
                                    Back to Sign In
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key={authMode}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                transition={{ duration: 0.25, ease: [0.4, 0.0, 0.2, 1] }}
                            >
                                <div className="mb-8">
                                    <h1 className="text-3xl lg:text-4xl font-display font-bold text-text-primary mb-2 leading-tight">
                                        {authMode === 'signup' ? 'Start Your Journey' : authMode === 'forgot' ? 'Reset Password' : authMode === 'update-password' ? 'New Password' : 'Welcome Back'}
                                    </h1>
                                    <p className="text-text-secondary font-body">
                                        {authMode === 'signup' ? 'Create your account to get started' : authMode === 'forgot' ? 'Enter your email to receive a recovery link' : authMode === 'update-password' ? 'Secure your account with a new password' : 'Sign in to your facility management hub'}
                                    </p>
                                </div>

                                {(authMode === 'signin' || authMode === 'signup') && (
                                    <div className="flex gap-1 mb-8 p-1 bg-muted rounded-xl border border-border w-full">
                                        <button
                                            onClick={() => setAuthMode('signin')}
                                            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-smooth ${authMode === 'signin'
                                                ? 'bg-primary text-text-inverse shadow-sm'
                                                : 'text-text-secondary hover:text-text-primary'
                                                }`}
                                        >
                                            Sign In
                                        </button>
                                        <button
                                            onClick={() => setAuthMode('signup')}
                                            className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm transition-smooth ${authMode === 'signup'
                                                ? 'bg-primary text-text-inverse shadow-sm'
                                                : 'text-text-secondary hover:text-text-primary'
                                                }`}
                                        >
                                            Sign Up
                                        </button>
                                    </div>
                                )}

                                <form className="space-y-4" onSubmit={handleAuthAction}>
                                    {authMode === 'signup' && (
                                        <div className="space-y-2 relative z-20">
                                            <label className="text-sm font-semibold text-text-primary font-body">Name*</label>
                                            <input
                                                type="text"
                                                placeholder="Enter your name"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                required
                                                className="w-full h-10 px-4 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                                            />
                                        </div>
                                    )}

                                    {(authMode === 'signin' || authMode === 'signup' || authMode === 'forgot') && (
                                        <div className="space-y-2 relative z-20">
                                            <label className="text-sm font-semibold text-text-primary font-body">Email*</label>
                                            <input
                                                type="email"
                                                placeholder="Enter your email"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                required
                                                className="w-full h-10 px-4 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                                            />
                                        </div>
                                    )}

                                    {(authMode === 'signin' || authMode === 'signup' || authMode === 'update-password') && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <label className="text-sm font-semibold text-text-primary font-body">
                                                    {authMode === 'update-password' ? 'New Password*' : 'Password*'}
                                                </label>
                                                {authMode === 'signin' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => router.push('/forgot-password')}
                                                        className="text-xs font-semibold text-primary hover:underline transition-smooth"
                                                    >
                                                        Forgot Password?
                                                    </button>
                                                )}
                                            </div>
                                            <div className="relative">
                                                <input
                                                    type={showPassword ? "text" : "password"}
                                                    placeholder="Enter your password"
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    required
                                                    className="w-full h-10 px-4 pr-10 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
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
                                    )}

                                    {authMode === 'update-password' && (
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-text-primary font-body">Confirm New Password*</label>
                                            <div className="relative">
                                                <input
                                                    type={showConfirmPassword ? "text" : "password"}
                                                    placeholder="Confirm your password"
                                                    value={confirmPassword}
                                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                                    required
                                                    className="w-full h-10 px-4 pr-10 rounded-[var(--radius-md)] border border-border bg-surface text-text-primary font-body placeholder:text-text-tertiary transition-smooth focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary hover:border-primary/50"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-secondary focus:outline-none transition-smooth"
                                                >
                                                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {error && (
                                        <div className="p-3 bg-error/10 text-error text-sm font-semibold rounded-[var(--radius-md)] border border-error/20">
                                            {error}
                                        </div>
                                    )}
                                    {success && (
                                        <div className="p-3 bg-success/10 text-success text-sm font-semibold rounded-[var(--radius-md)] border border-success/20">
                                            {success}
                                        </div>
                                    )}

                                    <button
                                        type="submit"
                                        disabled={loading}
                                        className="w-full bg-secondary hover:bg-secondary-dark text-text-inverse font-semibold py-3 rounded-[var(--radius-md)] shadow-sm transition-smooth flex items-center justify-center gap-2 group border border-secondary-dark disabled:opacity-50"
                                    >
                                        {loading ? (
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                {authMode === 'signup' ? 'Create Account' : authMode === 'forgot' ? 'Send Reset Link' : authMode === 'update-password' ? 'Update Password' : 'Sign In'}
                                                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-smooth" />
                                            </>
                                        )}
                                    </button>
                                </form>

                                {(authMode === 'signin' || authMode === 'signup') && (
                                    <div className="mt-6">
                                        <div className="relative flex items-center gap-3 mb-4">
                                            <div className="flex-1 h-px bg-border" />
                                            <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider">or continue with</span>
                                            <div className="flex-1 h-px bg-border" />
                                        </div>
                                        <div className="flex flex-col gap-3">
                                            <button
                                                type="button"
                                                onClick={handleGoogleAuth}
                                                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-[var(--radius-md)] border border-border bg-surface hover:bg-muted transition-smooth font-semibold text-sm text-text-primary"
                                            >
                                                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                                </svg>
                                                Sign in with Google
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleAppleAuth}
                                                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-[var(--radius-md)] border border-border bg-surface hover:bg-muted transition-smooth font-semibold text-sm text-text-primary"
                                            >
                                                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                                                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                                                </svg>
                                                Sign in with Apple
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right Side - Brand Showcase */}
                <div className="hidden lg:block w-1/2 p-8 relative overflow-hidden bg-primary/90 dark:bg-primary/20 transition-smooth">
                    <div className="absolute inset-0">
                        <div className="absolute top-0 right-0 w-[60%] h-[60%] bg-primary-light/30 rounded-full blur-3xl" />
                        <div className="absolute bottom-0 left-0 w-[50%] h-[50%] bg-primary-dark/30 rounded-full blur-3xl" />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-center items-center">
                        <div className="w-full max-w-sm space-y-6">
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={currentFeature}
                                    initial={{ opacity: 0, x: 50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -50 }}
                                    transition={{ duration: 0.4, ease: [0.4, 0.0, 0.2, 1] }}
                                    className="bg-surface/90 backdrop-blur-xl border border-border/30 rounded-[var(--radius-lg)] p-6 shadow-xl"
                                >
                                    <div className="w-14 h-14 rounded-[var(--radius-md)] bg-secondary flex items-center justify-center mb-4 shadow-sm">
                                        <Ticket className="w-7 h-7 text-white" />
                                    </div>
                                    <h3 className="text-text-primary text-xl font-display font-bold mb-2">95% Faster Resolution</h3>
                                    <p className="text-text-secondary text-sm font-body">Smart AI-powered ticketing for facility management operations.</p>
                                </motion.div>
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

export default function AuthPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-emerald-50"><Loader size="lg" text="Loading..." /></div>}>
            <AuthContent />
        </Suspense>
    );
}
