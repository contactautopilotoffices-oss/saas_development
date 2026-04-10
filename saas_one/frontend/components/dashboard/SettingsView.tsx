/**
 * SettingsView
 * User and property settings panel with profile, notifications, and preferences.
 * @remarks Client component.
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/frontend/context/AuthContext';
import { createClient } from '@/frontend/utils/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import {
    User, Mail, Phone, Camera, Save, Loader2,
    Shield, Building, CheckCircle2, AlertCircle, Home, Store,
    Bell, Video, ExternalLink, Info, X
} from 'lucide-react';
import Image from 'next/image';
import imageCompression from 'browser-image-compression';

interface RoleInfo {
    role: string;
    entityName: string;
    type: 'organization' | 'property';
}

interface SettingsViewProps {
    onUpdate?: () => void;
}

export default function SettingsView({ onUpdate }: SettingsViewProps) {
    const { user } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [profile, setProfile] = useState<any>(null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [userRoles, setUserRoles] = useState<RoleInfo[]>([]);
    const [vendorInfo, setVendorInfo] = useState<{ id: string; shop_name: string } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const supabase = createClient();

    // Permissions
    const [notifPerm, setNotifPerm] = useState<NotificationPermission | 'unsupported'>('default');
    const [cameraPerm, setCameraPerm] = useState<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');
    const [revokeHint, setRevokeHint] = useState<'notif' | 'camera' | null>(null);

    useEffect(() => {
        // Notification permission
        if (typeof Notification === 'undefined') {
            setNotifPerm('unsupported');
        } else {
            setNotifPerm(Notification.permission);
        }
        // Camera permission
        if (!navigator.permissions) {
            setCameraPerm('unsupported');
        } else {
            navigator.permissions.query({ name: 'camera' as PermissionName })
                .then(r => setCameraPerm(r.state as any))
                .catch(() => setCameraPerm('unsupported'));
        }
    }, []);

    const handleEnableNotifications = async () => {
        if (typeof Notification === 'undefined') return;
        const result = await Notification.requestPermission();
        setNotifPerm(result);
        if (result === 'granted') showToast('Notifications enabled');
    };

    const handleEnableCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(t => t.stop());
            setCameraPerm('granted');
            showToast('Camera access granted');
        } catch {
            setCameraPerm('denied');
            showToast('Camera access denied', 'error');
        }
    };

    const showToast = (message: string, type: 'success' | 'error' = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    useEffect(() => {
        if (user) {
            fetchProfile();
        }
    }, [user]);

    const fetchProfile = async () => {
        try {
            // 1. Fetch User Profile
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('*')
                .eq('id', user?.id)
                .single();

            if (userError) throw userError;

            // 2. Fetch Organization Memberships (only active)
            const { data: orgMembers, error: orgError } = await supabase
                .from('organization_memberships')
                .select('role, organization:organizations(name)')
                .eq('user_id', user?.id)
                .eq('is_active', true);

            // 3. Fetch Property Memberships (only active)
            const { data: propMembers, error: propError } = await supabase
                .from('property_memberships')
                .select('role, property:properties(name)')
                .eq('user_id', user?.id)
                .eq('is_active', true);

            setProfile(userData);
            if (userData.user_photo_url) {
                setAvatarPreview(userData.user_photo_url);
            }

            // Process Roles
            const roles: RoleInfo[] = [];

            if (orgMembers) {
                orgMembers.forEach((m: any) => {
                    roles.push({
                        role: m.role,
                        entityName: m.organization?.name || 'Unknown Org',
                        type: 'organization'
                    });
                });
            }

            if (propMembers) {
                propMembers.forEach((m: any) => {
                    roles.push({
                        role: m.role,
                        entityName: m.property?.name || 'Unknown Property',
                        type: 'property'
                    });
                });
            }

            setUserRoles(roles);

            // 4. Check if vendor
            const { data: vendorData } = await supabase
                .from('vendors')
                .select('id, shop_name')
                .eq('user_id', user?.id)
                .maybeSingle();

            if (vendorData) {
                setVendorInfo(vendorData);
            }

        } catch (err) {
            console.error('Error fetching profile:', err);
            // Fallback
            if (user) {
                setProfile({
                    full_name: user.user_metadata?.full_name || '',
                    email: user.email,
                    phone: user.user_metadata?.phone || '',
                });
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];

            // Allow only JPG/JPEG format as requested
            const fileType = file.type;
            if (fileType !== 'image/jpeg' && fileType !== 'image/jpg') {
                showToast('Only JPG/JPEG formats are allowed', 'error');
                return;
            }

            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };


    const uploadAvatar = async (userId: string): Promise<string | null> => {
        if (!avatarFile) return null;

        try {
            // Add Compressor before storing
            const options = {
                maxSizeMB: 0.1, // 100KB
                maxWidthOrHeight: 512,
                useWebWorker: true,
            };

            const compressedFile = await imageCompression(avatarFile, options);

            const filePath = `${userId}/profile.jpg`;

            const { error: uploadError } = await supabase.storage
                .from('user-photos')
                .upload(filePath, compressedFile, {
                    upsert: true
                });

            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('user-photos').getPublicUrl(filePath);
            return data.publicUrl;
        } catch (err) {
            console.error('Error uploading avatar:', err);
            throw err;
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !profile) return;

        setIsSaving(true);

        // Capture old phone before saving — used to detect first-time phone set
        const { data: oldRecord } = await supabase
            .from('users')
            .select('phone')
            .eq('id', user.id)
            .single();
        const oldPhone = oldRecord?.phone || '';

        try {
            let avatarUrl = profile.avatar_url;

            if (avatarFile) {
                const url = await uploadAvatar(user.id);
                if (url) avatarUrl = url;
            }

            // Update users table - Only use columns that exist
            const { error: dbError } = await supabase
                .from('users')
                .update({
                    full_name: profile.full_name,
                    phone: profile.phone,
                    user_photo_url: avatarUrl // Use the correct column
                })
                .eq('id', user.id);

            if (dbError) throw dbError;

            // Update vendor shop name if applicable
            if (vendorInfo) {
                const { error: vendorError } = await supabase
                    .from('vendors')
                    .update({ shop_name: vendorInfo.shop_name })
                    .eq('id', vendorInfo.id);

                if (vendorError) throw vendorError;
            }

            // Update Auth Metadata
            const { error: authError } = await supabase.auth.updateUser({
                data: {
                    full_name: profile.full_name,
                    avatar_url: avatarUrl,
                    user_photo_url: avatarUrl,
                    phone: profile.phone
                }
            });

            if (authError) throw authError;

            showToast('Profile updated successfully');
            if (onUpdate) onUpdate();
            fetchProfile();

            // Send welcome WhatsApp if phone was just set for the first time
            const newPhone = profile.phone?.trim() || '';
            if (!oldPhone && newPhone) {
                fetch('/api/users/send-welcome', { method: 'POST' }).catch(() => {});
            }
        } catch (err: any) {
            console.error('Error saving profile:', err);
            showToast(err.message || 'Failed to update profile', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const formatRole = (role: string) => {
        let displayRole = role === 'tenant' ? 'client' : role;
        return displayRole.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    if (isLoading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-4 md:space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div>
                <h1 className="text-xl md:text-3xl font-display font-bold text-slate-900">Account Settings</h1>
                <p className="text-slate-500 font-body mt-1 text-sm">Manage your personal information and profile details.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
                {/* Profile Section */}
                <section className="bg-white rounded-2xl border border-slate-200 p-4 md:p-8 shadow-sm">
                    <h2 className="text-xl font-display font-semibold text-slate-900 mb-6 flex items-center gap-2">
                        <User className="w-5 h-5 text-primary" />
                        Profile Information
                    </h2>

                    <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
                        {/* Avatar Upload */}
                        <div className="flex flex-col items-center gap-4">
                            <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                <div className="w-24 h-24 md:w-32 md:h-32 rounded-full overflow-hidden border-4 border-slate-100 bg-slate-50 relative">
                                    {avatarPreview ? (
                                        <Image
                                            src={avatarPreview}
                                            alt="Profile"
                                            fill
                                            className="object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                            <User className="w-16 h-16" />
                                        </div>
                                    )}

                                    {/* Overlay */}
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Camera className="w-8 h-8 text-white" />
                                    </div>
                                </div>
                                <div className="absolute bottom-0 right-2 w-8 h-8 bg-primary rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                    <Camera className="w-4 h-4 text-white" />
                                </div>
                            </div>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                className="hidden"
                                accept=".jpg,.jpeg"
                            />
                            <p className="text-xs font-semibold text-slate-500">Allowed *.jpg, *.jpeg</p>
                        </div>

                        {/* Fields */}
                        <div className="flex-1 space-y-5 w-full">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Full Name</label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="text"
                                            value={profile?.full_name || ''}
                                            onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-slate-900"
                                            placeholder="John Doe"
                                        />
                                    </div>
                                </div>

                                {vendorInfo && (
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold text-slate-700">Shop Name</label>
                                        <div className="relative">
                                            <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                            <input
                                                type="text"
                                                value={vendorInfo.shop_name}
                                                onChange={(e) => setVendorInfo({ ...vendorInfo, shop_name: e.target.value })}
                                                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-slate-900"
                                                placeholder="My Awesome Shop"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-slate-700">Phone</label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={profile?.phone || ''}
                                            onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all font-medium text-slate-900"
                                            placeholder="+1 (555) 000-0000"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2 md:col-span-2">
                                    <label className="text-sm font-semibold text-slate-700">Email Address</label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                        <input
                                            type="email"
                                            value={profile?.email || ''}
                                            disabled
                                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-medium cursor-not-allowed"
                                        />
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-md border border-amber-100">
                                            Read Only
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-500 font-medium ml-1">
                                        Email address cannot be changed. Please contact support if you need to update it.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Additional Info Section (Read Only) */}
                <section className="bg-white rounded-2xl border border-slate-200 p-4 md:p-8 shadow-sm">
                    <h2 className="text-xl font-display font-semibold text-slate-900 mb-6 flex items-center gap-2">
                        <Shield className="w-5 h-5 text-primary" />
                        Account Roles & Memberships
                    </h2>

                    <div className="grid grid-cols-1 gap-4">
                        {userRoles.length > 0 ? (
                            userRoles.map((role, idx) => (
                                <div key={idx} className="p-4 rounded-xl bg-slate-50 border border-slate-100 flex items-start gap-3">
                                    <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm">
                                        {role.type === 'organization' ? (
                                            <Building className="w-5 h-5 text-indigo-500" />
                                        ) : (
                                            <Home className="w-5 h-5 text-emerald-500" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                                {role.type}
                                            </p>
                                            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">
                                                {formatRole(role.role)}
                                            </span>
                                        </div>
                                        <p className="text-sm font-bold text-slate-900">
                                            {role.entityName}
                                        </p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-4 text-slate-500 text-sm">
                                No active memberships found.
                            </div>
                        )}
                    </div>
                </section>

                {/* Permissions Section */}
                <section className="bg-white rounded-2xl border border-slate-200 p-4 md:p-8 shadow-sm">
                    <h2 className="text-xl font-display font-semibold text-slate-900 mb-1 flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" />
                        App Permissions
                    </h2>
                    <p className="text-sm text-slate-500 mb-6">Manage browser permissions used by this app.</p>

                    <div className="space-y-3">
                        {/* Notifications */}
                        <div className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                            <div className="flex items-center gap-4 p-4">
                                <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <Bell className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-slate-900">Push Notifications</p>
                                    <p className="text-xs text-slate-500">Receive alerts for tickets, updates &amp; reminders</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {notifPerm === 'granted' && (
                                        <>
                                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Enabled
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setRevokeHint(revokeHint === 'notif' ? null : 'notif')}
                                                className="text-xs font-black px-3 py-1.5 bg-slate-200 text-slate-600 rounded-xl hover:bg-rose-100 hover:text-rose-700 active:scale-95 transition-all whitespace-nowrap"
                                            >
                                                Revoke
                                            </button>
                                        </>
                                    )}
                                    {notifPerm === 'denied' && (
                                        <a href="https://support.google.com/chrome/answer/3220216" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
                                            <ExternalLink className="w-3.5 h-3.5" /> Blocked — Fix in browser
                                        </a>
                                    )}
                                    {notifPerm === 'default' && (
                                        <button type="button" onClick={handleEnableNotifications}
                                            className="text-xs font-black px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 transition-all whitespace-nowrap">
                                            Enable
                                        </button>
                                    )}
                                    {notifPerm === 'unsupported' && (
                                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">Not supported</span>
                                    )}
                                </div>
                            </div>
                            {/* Revoke instructions for notifications */}
                            <AnimatePresence>
                                {revokeHint === 'notif' && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mx-4 mb-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl flex gap-3">
                                            <Info className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-indigo-800 mb-1">How to revoke notification permission:</p>
                                                <ol className="text-xs text-indigo-700 space-y-1 list-decimal list-inside">
                                                    <li>Click the <strong>lock icon 🔒</strong> in your browser's address bar</li>
                                                    <li>Click <strong>"Notifications"</strong></li>
                                                    <li>Select <strong>"Block"</strong> or <strong>"Ask"</strong></li>
                                                    <li>Reload the page</li>
                                                </ol>
                                            </div>
                                            <button type="button" onClick={() => setRevokeHint(null)} className="flex-shrink-0 text-indigo-400 hover:text-indigo-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Camera */}
                        <div className="rounded-xl bg-slate-50 border border-slate-100 overflow-hidden">
                            <div className="flex items-center gap-4 p-4">
                                <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center flex-shrink-0">
                                    <Video className="w-5 h-5 text-violet-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-sm text-slate-900">Camera</p>
                                    <p className="text-xs text-slate-500">Scan QR codes &amp; capture photos for reports</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {cameraPerm === 'granted' && (
                                        <>
                                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Enabled
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => setRevokeHint(revokeHint === 'camera' ? null : 'camera')}
                                                className="text-xs font-black px-3 py-1.5 bg-slate-200 text-slate-600 rounded-xl hover:bg-rose-100 hover:text-rose-700 active:scale-95 transition-all whitespace-nowrap"
                                            >
                                                Revoke
                                            </button>
                                        </>
                                    )}
                                    {cameraPerm === 'denied' && (
                                        <a href="https://support.google.com/chrome/answer/2693767" target="_blank" rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full hover:bg-amber-100 transition-colors">
                                            <ExternalLink className="w-3.5 h-3.5" /> Blocked — Fix in browser
                                        </a>
                                    )}
                                    {cameraPerm === 'prompt' && (
                                        <button type="button" onClick={handleEnableCamera}
                                            className="text-xs font-black px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 active:scale-95 transition-all whitespace-nowrap">
                                            Enable
                                        </button>
                                    )}
                                    {cameraPerm === 'unsupported' && (
                                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">Not supported</span>
                                    )}
                                </div>
                            </div>
                            {/* Revoke instructions for camera */}
                            <AnimatePresence>
                                {revokeHint === 'camera' && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="mx-4 mb-4 p-4 bg-violet-50 border border-violet-100 rounded-xl flex gap-3">
                                            <Info className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-violet-800 mb-1">How to revoke camera permission:</p>
                                                <ol className="text-xs text-violet-700 space-y-1 list-decimal list-inside">
                                                    <li>Click the <strong>lock icon 🔒</strong> in your browser's address bar</li>
                                                    <li>Click <strong>"Camera"</strong></li>
                                                    <li>Select <strong>"Block"</strong> or <strong>"Ask"</strong></li>
                                                    <li>Reload the page</li>
                                                </ol>
                                            </div>
                                            <button type="button" onClick={() => setRevokeHint(null)} className="flex-shrink-0 text-violet-400 hover:text-violet-600">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </section>

                {/* Actions */}
                <div className="flex justify-end pt-2 md:pt-4">
                    <button
                        type="submit"
                        disabled={isSaving}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-70 shadow-sm shadow-primary/20"
                    >
                        {isSaving ? (
                            <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </form>

            <AnimatePresence>
                {toast && (
                    <motion.div
                        initial={{ opacity: 0, y: 50, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100]"
                    >
                        <div className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'success'
                            ? 'bg-emerald-900 border-emerald-500/50 text-emerald-50'
                            : 'bg-rose-900 border-rose-500/50 text-rose-50'
                            }`}>
                            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
                            <span className="font-bold text-sm tracking-tight">{toast.message}</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
