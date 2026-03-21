'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowRight, ArrowLeft, Building2, UserCircle2,
    Sparkles, PartyPopper, Check, Loader2, Phone, Wrench, Hammer, Briefcase
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/frontend/context/AuthContext';
import { createClient } from '@/frontend/utils/supabase/client';
import Loader from '@/frontend/components/ui/Loader';

interface Property {
    id: string;
    name: string;
    code: string;
    organization_id: string;
}

const AUTOPILOT_ORG_ID = process.env.NEXT_PUBLIC_AUTOPILOT_ORG_ID;

const AVAILABLE_ROLES = [
    { id: 'property_admin', label: 'Property Admin', desc: 'Manage property operations & staff', icon: '🏢' },
    { id: 'staff', label: 'Soft Services Staff', desc: 'Cleaning, hygiene, pantry & support', icon: '👷' },
    { id: 'mst', label: 'Maintenance Staff', desc: 'Technical repairs & maintenance', icon: '🔧' },
    { id: 'security', label: 'Security', desc: 'Property security & access control', icon: '🛡️' },
    { id: 'tenant', label: 'Client', desc: 'Raise requests & view updates', icon: '🏠' },
    { id: 'vendor', label: 'Vendor', desc: 'Manage shop revenue & orders', icon: '🍔' },
];

const SKILL_OPTIONS: Record<string, { code: string; label: string; icon: any }[]> = {
    mst: [
        { code: 'technical', label: 'Technical', icon: Wrench },
        { code: 'plumbing', label: 'Plumbing', icon: Hammer },
        { code: 'vendor', label: 'Vendor Coordination', icon: Briefcase },
    ],
    staff: [
        { code: 'technical', label: 'Technical', icon: Wrench },
        { code: 'soft_services', label: 'Soft Services', icon: Sparkles },
        { code: 'soft_service_manager', label: 'Soft Service Manager', icon: UserCircle2 },
    ],
};

// Fireworks particle component
const Particle = ({ delay }: { delay: number }) => {
    const colors = ['#f28c33', '#a855f7', '#ec4899', '#22c55e', '#3b82f6', '#eab308'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    const angle = Math.random() * 360;
    const distance = 80 + Math.random() * 120;
    const x = Math.cos(angle * Math.PI / 180) * distance;
    const y = Math.sin(angle * Math.PI / 180) * distance;

    return (
        <motion.div
            className="absolute w-3 h-3 rounded-full"
            style={{ backgroundColor: color }}
            initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
            animate={{
                scale: [0, 1.5, 0],
                x: [0, x],
                y: [0, y],
                opacity: [1, 1, 0]
            }}
            transition={{
                duration: 1.2,
                delay: delay,
                ease: [0.32, 0, 0.67, 0]
            }}
        />
    );
};

const FireworksAnimation = ({ onComplete }: { onComplete: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(onComplete, 3000);
        return () => clearTimeout(timer);
    }, [onComplete]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm">
            <div className="relative">
                {[0, 0.3, 0.6, 0.9, 1.2].map((delay, burstIdx) => (
                    <motion.div
                        key={burstIdx}
                        className="absolute"
                        style={{
                            left: `${(burstIdx - 2) * 80}px`,
                            top: `${Math.sin(burstIdx) * 50}px`
                        }}
                    >
                        {Array.from({ length: 20 }).map((_, i) => (
                            <Particle key={i} delay={delay + i * 0.02} />
                        ))}
                    </motion.div>
                ))}

                <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                    className="text-center relative z-10"
                >
                    <motion.div
                        animate={{ rotate: [0, 10, -10, 0] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                    >
                        <PartyPopper className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
                    </motion.div>
                    <h1 className="text-5xl font-black text-white mb-4">
                        Welcome Aboard! 🎉
                    </h1>
                    <p className="text-xl text-white/70 font-medium">
                        Your workspace is ready
                    </p>
                </motion.div>
            </div>
        </div>
    );
};

export default function OnboardingPage() {
    const [step, setStep] = useState(0);
    const [userName, setUserName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [properties, setProperties] = useState<Property[]>([]);
    const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [showFireworks, setShowFireworks] = useState(false);
    const [error, setError] = useState('');

    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();
    const supabase = createClient();

    useEffect(() => {
        const initialize = async () => {
            if (authLoading) return; // Wait for auth to settle
            if (!user) {
                router.push('/login');
                return;
            }

            try {
                // Greeting from metadata (passed during signup)
                const nameFromMetadata = user.user_metadata?.full_name || user.user_metadata?.name;
                if (nameFromMetadata) {
                    setUserName(nameFromMetadata.split(' ')[0]);
                } else {
                    // Fallback to DB check
                    const { data: dbUser } = await supabase
                        .from('users')
                        .select('full_name, phone')
                        .eq('id', user.id)
                        .maybeSingle();

                    if (dbUser?.full_name) {
                        setUserName(dbUser.full_name.split(' ')[0]);
                    } else {
                        setUserName('there');
                    }

                    if (dbUser?.phone) {
                        setPhoneNumber(dbUser.phone);
                    }
                }
            } catch (err) {
                console.error('Initialization error:', err);
            } finally {
                setLoading(false);
            }
        };

        initialize();
    }, [user, authLoading, router, supabase]);


    useEffect(() => {
        const fetchProperties = async () => {
            const orgId = process.env.NEXT_PUBLIC_AUTOPILOT_ORG_ID;

            if (!orgId) {
                console.error('Autopilot org ID missing from environment variables');
                setError('Autopilot org ID missing. Please check your system configuration.');
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('properties')
                    .select('*')
                    .eq('organization_id', orgId)
                    .order('name');

                if (error) throw error;

                const mappedProps = (data || []).map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    code: p.code || p.slug || 'unknown',
                    organization_id: p.organization_id
                }));

                setProperties(mappedProps);
            } catch (err: any) {
                console.error('Properties fetch error:', err);
                setError(err.message || 'Failed to load properties.');
            } finally {
                setLoading(false);
            }
        };

        fetchProperties();
    }, [supabase]);

    const handleComplete = useCallback(async () => {
        if (!user || !selectedProperty || !selectedRole || !AUTOPILOT_ORG_ID) return;

        setSubmitting(true);
        setError('');

        try {
            // Use the user from AuthContext directly — avoids session issues with Google OAuth
            // where the server-side session exchange may not be reflected in client getUser()
            const authUser = user;

            // Resolve Property ID
            let finalPropId = selectedProperty.id;
            if (finalPropId === 'default') {
                const { data: realProp } = await supabase.from('properties').select('id').eq('organization_id', AUTOPILOT_ORG_ID).limit(1).maybeSingle();
                if (realProp) finalPropId = realProp.id;
                else throw new Error("No properties found for this organization.");
            }

            // Ensure Org ID is resolved before insertion
            let targetOrgId = AUTOPILOT_ORG_ID;
            if (!targetOrgId || targetOrgId === 'undefined') {
                const { data: org } = await supabase.from('organizations').select('id').or('code.eq.autopilot,name.ilike.%autopilot%').limit(1).maybeSingle();
                if (org) targetOrgId = org.id;
            }

            // 1️⃣ Insert property membership
            const finalRole = (selectedRole === 'staff' && selectedSkills.includes('soft_service_manager'))
                ? 'soft_service_manager'
                : selectedRole;

            const { error: membershipError } = await supabase
                .from('property_memberships')
                .insert({
                    user_id: authUser.id,
                    organization_id: targetOrgId,
                    property_id: finalPropId,
                    role: finalRole as any,
                    is_active: true
                });

            if (membershipError) {
                // Ignore duplicate key errors, throw others
                if (!membershipError.message.toLowerCase().includes('duplicate key')) {
                    console.error('Membership insert failed:', membershipError);
                    throw membershipError;
                }
            }

            // 1.5️⃣ Insert into vendors if role is vendor
            if (selectedRole === 'vendor') {
                const { data: dbUser } = await supabase
                    .from('users')
                    .select('full_name')
                    .eq('id', authUser.id)
                    .maybeSingle();

                const { error: vendorError } = await supabase
                    .from('vendors')
                    .insert({
                        user_id: authUser.id,
                        property_id: finalPropId,
                        shop_name: `${userName}'s Shop`, // Temporary name
                        vendor_name: dbUser?.full_name || userName,
                        commission_rate: 10, // Default 10%
                        status: 'active'
                    });

                if (vendorError) {
                    // Ignore duplicate key errors
                    if (!vendorError.message.toLowerCase().includes('duplicate key')) {
                        console.error('Vendor record creation failed:', vendorError);
                        throw vendorError;
                    }
                }
            }

            // 1.7️⃣ Insert into mst_skills (shared skill mapping)
            if (selectedSkills.length > 0) {
                const skillsToInsert = selectedSkills.map(code => ({
                    user_id: authUser.id,
                    skill_code: code
                }));
                const { error: mstSkillError } = await supabase
                    .from('mst_skills')
                    .insert(skillsToInsert);

                if (mstSkillError && !mstSkillError.message.toLowerCase().includes('duplicate key')) {
                    console.error('MST Skills insert failed:', mstSkillError);
                }
            }

            // 2️⃣ Insert Resolver Stats (if skills selected)
            // NOTE: "Staff Technical" accounts are treated as BMS accounts and are NOT stored in resolver_stats.
            // Strict Filter based on User Request:
            // MST -> technical, plumbing, vendor
            // Staff -> soft_services
            if (selectedSkills.length > 0) {
                const VALID_MST_SKILLS = ['technical', 'plumbing', 'vendor'];
                const VALID_STAFF_SKILLS = ['soft_services'];

                const skillsForResolver = selectedRole === 'mst'
                    ? selectedSkills.filter(skill => VALID_MST_SKILLS.includes(skill))
                    : (selectedRole === 'staff' ? selectedSkills.filter(skill => VALID_STAFF_SKILLS.includes(skill)) : []);

                if (skillsForResolver.length > 0) {
                    // Fetch skill group IDs (Global/Active check)
                    const { data: skillGroups, error: skillError } = await supabase
                        .from('skill_groups')
                        .select('id, code')
                        .eq('is_active', true)
                        .in('code', skillsForResolver);

                    if (skillError) {
                        console.error('Failed to fetch skill groups:', JSON.stringify(skillError, null, 2));
                    } else if (skillGroups && skillGroups.length > 0) {
                        const statsToInsert = skillGroups.map(sg => ({
                            user_id: authUser.id,
                            property_id: finalPropId,
                            skill_group_id: sg.id,
                            current_floor: 1,
                            avg_resolution_minutes: 60,
                            total_resolved: 0,
                            is_available: true
                        }));

                        const { error: statsError } = await supabase
                            .from('resolver_stats')
                            .insert(statsToInsert);

                        if (statsError && !statsError.message.toLowerCase().includes('duplicate key')) {
                            console.error('Failed to insert resolver stats:', statsError);
                        }
                    }
                }
            }

            // 3️⃣ Update user profile with phone (if filled) and onboarding status
            const profileUpdate: any = { onboarding_completed: true };
            if (phoneNumber.trim().length >= 10) {
                profileUpdate.phone = phoneNumber.trim();
            }

            const { error: userUpdateError } = await supabase
                .from('users')
                .update(profileUpdate)
                .eq('id', authUser.id);

            if (userUpdateError) {
                console.error('User update failed:', userUpdateError);
                throw userUpdateError;
            }

            // Sync with metadata for fallback
            await supabase.auth.updateUser({
                data: { onboarding_completed: true }
            });

            setShowFireworks(true);
        } catch (err: any) {
            console.error('Onboarding completion error:', err);
            setError(err.message || 'Failed to complete setup.');
            setSubmitting(false);
        }
    }, [user, selectedProperty, selectedRole, phoneNumber, supabase, selectedSkills, userName]);



    const handleFireworksComplete = () => {
        setShowFireworks(false);
        // Onboarding is only for sign up. After completion, go to login.
        router.push('/login');
    };

    const nextStep = () => {
        if (step === 3 && (selectedRole === 'mst' || selectedRole === 'staff')) {
            // Need to go to skills step
            setStep(4);
        } else if (step === 3) {
            // For other roles, finish
            handleComplete();
        } else if (step === 4) {
            handleComplete();
        } else {
            setStep((prev) => prev + 1);
        }
    };

    const prevStep = () => setStep((prev) => Math.max(prev - 1, 0));

    const toggleSkill = (code: string) => {
        setSelectedSkills(prev =>
            prev.includes(code)
                ? prev.filter(c => c !== code)
                : [...prev, code]
        );
    };

    const canProceed = () => {
        switch (step) {
            case 0: return true;
            case 1: return phoneNumber.length === 0 || phoneNumber.length >= 10;
            case 2: return selectedProperty !== null;
            case 3: return selectedRole !== null;
            case 4: return selectedSkills.length > 0;
            default: return false;
        }
    };

    // Calculate total steps including skill step if relevant
    const showSkillsStep = selectedRole && (selectedRole === 'mst' || selectedRole === 'staff');
    const totalSteps = showSkillsStep ? 5 : 4;


    if ((loading || authLoading) && step === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="bg-slate-800/30 backdrop-blur-sm rounded-3xl p-12 border border-slate-700/50 shadow-2xl">
                    <Loader size="xl" text="Loading your workspace..." />
                </div>
            </div>
        );
    }

    return (
        <>
            {showFireworks && <FireworksAnimation onComplete={handleFireworksComplete} />}

            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 font-sans">
                <div className="w-full max-w-md mb-12">
                    <div className="flex gap-2">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                            <motion.div
                                key={i}
                                className={`h-1.5 flex-1 rounded-full transition-all duration-500`}
                                animate={{
                                    backgroundColor: step >= i ? '#a855f7' : '#27272a'
                                }}
                            />
                        ))}
                    </div>
                    <p className="text-center text-slate-500 text-sm font-medium mt-4">
                        Step {step + 1} of {totalSteps}
                    </p>
                </div>

                <div className="w-full max-w-2xl relative overflow-hidden min-h-[400px]">
                    <AnimatePresence mode="wait">
                        {step === 0 && (
                            <motion.div
                                key="welcome" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                                className="flex flex-col items-center text-center"
                            >
                                <motion.div
                                    initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                                    className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mb-8 shadow-2xl shadow-violet-500/30"
                                >
                                    <Sparkles className="w-10 h-10 text-white" />
                                </motion.div>
                                <h1 className="text-4xl md:text-5xl font-black text-white mb-4">
                                    Hello, <span className="text-violet-400">{userName}</span>!
                                </h1>
                                <p className="text-xl text-slate-400 font-medium mb-2">Welcome to Autopilot Offices</p>
                                <p className="text-slate-500 max-w-md">Let's get you set up in just a few quick steps. We'll help you choose your workspace.</p>
                            </motion.div>
                        )}


                        {step === 1 && (
                            <motion.div
                                key="phone" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                                className="flex flex-col items-center"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center mb-6 shadow-xl">
                                    <Phone className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2 text-center">Contact Details</h2>
                                <p className="text-slate-400 font-medium mb-8 text-center">Enter your phone number <span className="text-slate-500 text-sm">(optional)</span></p>

                                <div className="w-full max-w-sm">
                                    <input
                                        type="tel"
                                        placeholder="Mobile Number (e.g. 9876543210)"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value.replace(/[^0-9]/g, ''))}
                                        className="w-full p-5 rounded-2xl bg-slate-800/50 border border-slate-700 text-white text-xl font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600 tracking-wider text-center"
                                        maxLength={15}
                                    />
                                    <p className="text-xs text-slate-500 mt-4 text-center">
                                        We will use this for important notifications only.
                                    </p>
                                </div>
                            </motion.div>
                        )}


                        {step === 2 && (
                            <motion.div
                                key="property" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                                className="flex flex-col items-center"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center mb-6 shadow-xl">
                                    <Building2 className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2 text-center">Choose Your Property</h2>
                                <p className="text-slate-400 font-medium mb-8 text-center">Select the property you'll be managing</p>

                                {loading ? (
                                    <Loader size="sm" text="Loading properties..." className="text-slate-400" />
                                ) : (
                                    <div className="w-full space-y-3 max-h-[300px] overflow-y-auto pr-2">
                                        {properties.length === 0 ? (
                                            <div className="flex flex-col items-center justify-center py-12 bg-slate-800/20 border-2 border-dashed border-slate-700 rounded-3xl p-8">
                                                <p className="text-slate-500 font-medium text-center">No properties found.</p>
                                                <button
                                                    onClick={() => setSelectedProperty({ id: 'default', name: 'Main Campus', code: 'main', organization_id: process.env.NEXT_PUBLIC_AUTOPILOT_ORG_ID || 'default' })}
                                                    className="mt-6 px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-sm font-bold transition-all"
                                                >
                                                    Use Main Campus (Default)
                                                </button>
                                            </div>
                                        ) : (
                                            properties.map((prop) => (
                                                <button
                                                    key={prop.id} onClick={() => setSelectedProperty(prop)}
                                                    className={`w-full p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${selectedProperty?.id === prop.id
                                                        ? 'bg-emerald-500/20 border-emerald-500 text-white'
                                                        : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                                        }`}
                                                >
                                                    <div className="flex items-center gap-4">
                                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${selectedProperty?.id === prop.id ? 'bg-emerald-500' : 'bg-slate-700 group-hover:bg-slate-600'}`}>🏢</div>
                                                        <div className="text-left">
                                                            <p className="font-bold text-lg">{prop.name}</p>
                                                            <p className="text-sm text-slate-500">{prop.code}</p>
                                                        </div>
                                                    </div>
                                                    {selectedProperty?.id === prop.id && <Check className="w-6 h-6 text-emerald-400" />}
                                                </button>
                                            ))
                                        )}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div
                                key="role" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                                className="flex flex-col items-center"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center mb-6 shadow-xl">
                                    <UserCircle2 className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2 text-center">Choose Your Role</h2>
                                <p className="text-slate-400 font-medium mb-8 text-center">How will you be using Autopilot?</p>

                                <div className="w-full space-y-3">
                                    {AVAILABLE_ROLES.map((role) => (
                                        <button
                                            key={role.id} onClick={() => setSelectedRole(role.id)}
                                            className={`w-full p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${selectedRole === role.id
                                                ? 'bg-orange-500/20 border-orange-500 text-white'
                                                : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                                }`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${selectedRole === role.id ? 'bg-orange-500' : 'bg-slate-700 group-hover:bg-slate-600'}`}>{role.icon}</div>
                                                <div className="text-left">
                                                    <p className="font-bold text-lg">{role.label}</p>
                                                    <p className="text-sm text-slate-500">{role.desc}</p>
                                                </div>
                                            </div>
                                            {selectedRole === role.id && <Check className="w-6 h-6 text-orange-400" />}
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {step === 4 && selectedRole && SKILL_OPTIONS[selectedRole] && (
                            <motion.div
                                key="skills" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
                                className="flex flex-col items-center"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mb-6 shadow-xl">
                                    <Wrench className="w-8 h-8 text-white" />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2 text-center">Select Your Skills</h2>
                                <p className="text-slate-400 font-medium mb-8 text-center">What kind of tasks do you handle?</p>

                                <div className="w-full space-y-3">
                                    {SKILL_OPTIONS[selectedRole].map((skill) => {
                                        const isSelected = selectedSkills.includes(skill.code);
                                        const Icon = skill.icon;
                                        return (
                                            <button
                                                key={skill.code}
                                                onClick={() => toggleSkill(skill.code)}
                                                className={`w-full p-5 rounded-2xl border-2 transition-all flex items-center justify-between group ${isSelected
                                                    ? 'bg-indigo-500/20 border-indigo-500 text-white'
                                                    : 'bg-slate-800/50 border-slate-700 text-slate-300 hover:border-slate-600'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isSelected ? 'bg-indigo-500' : 'bg-slate-700 group-hover:bg-slate-600'}`}>
                                                        <Icon className="w-6 h-6" />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="font-bold text-lg">{skill.label}</p>
                                                    </div>
                                                </div>
                                                <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-indigo-500 border-indigo-500' : 'border-slate-600'
                                                    }`}>
                                                    {isSelected && <Check className="w-4 h-4 text-white" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </motion.div>
                        )}

                    </AnimatePresence>
                </div>

                {error && (
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mt-6 p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-500 text-sm font-bold max-w-md text-center">
                        {error}
                    </motion.div>
                )}

                <div className="mt-12 w-full max-w-md flex justify-between items-center">
                    <button
                        onClick={prevStep} disabled={step === 0}
                        className={`flex items-center gap-2 font-bold transition-all px-6 py-3 rounded-xl ${step === 0 ? 'opacity-0 pointer-events-none' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                    >
                        <ArrowLeft className="w-5 h-5" /> Back
                    </button>

                    <button
                        onClick={nextStep} disabled={!canProceed() || submitting}
                        className={`px-8 py-4 font-black rounded-2xl flex items-center gap-3 transition-all shadow-xl ${canProceed() && !submitting ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white hover:shadow-violet-500/30 hover:scale-105' : 'bg-slate-700 text-slate-500 cursor-not-allowed'}`}
                    >
                        {submitting ? <><Loader2 className="w-5 h-5 animate-spin" />Setting up...</> : step === (totalSteps - 1) ? <>Complete Setup <Sparkles className="w-5 h-5" /></> : <>Continue <ArrowRight className="w-5 h-5" /></>}
                    </button>
                </div>
            </div>
        </>
    );
}
