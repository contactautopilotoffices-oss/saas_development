'use client';

import React from 'react';
import { Mail, Lock, User, Phone, ArrowRight, CheckCircle2, ShieldCheck, Zap } from 'lucide-react';
import { motion } from 'framer-motion';
import { useParams } from 'next/navigation';

const JoinPropertyPage = () => {
    const params = useParams();
    const propertyCode = params.propertyCode as string;

    // In a real app, you would fetch property details based on propertyCode here
    const displayedPropertyName = propertyCode?.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') || 'your property';

    const features = [
        {
            title: "Direct Property Link",
            metric: "SECURE",
            description: "Auto-assigned to your workplace",
            tag: "COMPLIANCE",
            color: "from-emerald-500 to-teal-700"
        },
        {
            title: "Smart Ticketing",
            metric: "LIVE",
            description: "Direct line to your facility team",
            tag: "EFFICIENCY",
            color: "from-blue-500 to-indigo-700"
        },
        {
            title: "Building Guide",
            metric: "2.5D",
            description: "Interactive floor navigation",
            tag: "EXPERIENCE",
            color: "from-orange-500 to-red-600"
        }
    ];

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-[#f3f4f6] p-4 font-sans overflow-hidden">
            {/* Main Container */}
            <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[32px] shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col md:flex-row min-h-[800px]"
            >

                {/* Left Side: Form */}
                <div className="w-full md:w-1/2 p-8 md:p-16 flex flex-col justify-center bg-white">
                    <div className="mb-10">
                        <div className="flex items-center gap-2 mb-8">
                            <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
                                <div className="w-5 h-5 border-2 border-white rounded-sm rotate-45"></div>
                            </div>
                            <span className="font-bold text-2xl tracking-tight">Autopilot</span>
                        </div>

                        <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4 leading-tight">
                            Join <span className="text-[#f28c33]">{displayedPropertyName}</span>
                        </h1>
                        <p className="text-slate-500 text-lg font-medium">
                            Private invite for <span className="font-bold text-slate-800 underline decoration-[#f28c33] decoration-2">{displayedPropertyName}</span> tenant network.
                        </p>
                    </div>

                    {/* Social Logins */}
                    <div className="flex flex-col gap-3 mb-8">
                        <button className="w-full flex items-center justify-center gap-3 py-4 px-4 border border-slate-200 rounded-2xl font-semibold text-slate-700 hover:bg-slate-50 transition-all group">
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" className="w-6 h-6 group-hover:scale-110 transition-transform" alt="Google" />
                            Sign in with Google
                        </button>
                        <button className="w-full flex items-center justify-center gap-3 py-4 px-4 border border-slate-200 rounded-2xl font-semibold text-slate-700 hover:bg-slate-50 transition-all group">
                            <img src="https://www.svgrepo.com/show/511330/apple-173.svg" className="w-6 h-6 group-hover:scale-110 transition-transform" alt="Apple" />
                            Sign in with Apple
                        </button>
                    </div>

                    <div className="relative mb-8 text-center">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                        <span className="relative bg-white px-4 text-sm font-bold text-slate-400 uppercase tracking-widest">or email signup</span>
                    </div>

                    {/* Form Fields */}
                    <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Full Name*</label>
                                <div className="relative">
                                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                    <input
                                        type="text"
                                        placeholder="John Doe"
                                        required
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:border-[#f28c33] focus:ring-4 focus:ring-orange-100 outline-none transition-all shadow-sm font-medium"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold text-slate-700 ml-1">Mobile Number*</label>
                                <div className="relative">
                                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                    <input
                                        type="tel"
                                        placeholder="+1 (555) 000-0000"
                                        required
                                        className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:border-[#f28c33] focus:ring-4 focus:ring-orange-100 outline-none transition-all shadow-sm font-medium"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">Work Email*</label>
                            <div className="relative">
                                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="email"
                                    placeholder="name@company.com"
                                    required
                                    className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:border-[#f28c33] focus:ring-4 focus:ring-orange-100 outline-none transition-all shadow-sm font-medium"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-bold text-slate-700 ml-1">Password*</label>
                            <div className="relative">
                                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:border-[#f28c33] focus:ring-4 focus:ring-orange-100 outline-none transition-all shadow-sm font-medium"
                                />
                            </div>
                        </div>

                        <button className="w-full bg-[#f28c33] hover:bg-[#e07b22] text-white font-bold py-5 rounded-2xl shadow-xl shadow-orange-200 transition-all transform active:scale-[0.98] mt-6 flex items-center justify-center gap-3 text-lg group">
                            Join Property Dashboard
                            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </form>

                    <p className="text-center mt-8 text-slate-500 font-medium italic">
                        "Your workspace, simplified. Only accessible via invite."
                    </p>
                </div>

                {/* Right Side: Animated Branding */}
                <div className="hidden md:block w-1/2 p-8 relative overflow-hidden bg-[#0a4d3c]">
                    {/* Orbs */}
                    <motion.div
                        animate={{ scale: [1, 1.2, 1], x: [0, 50, 0], y: [0, 30, 0] }}
                        transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute top-[-10%] left-[-10%] w-[80%] h-[80%] bg-[#126b54] rounded-full blur-[100px] opacity-40"
                    />
                    <motion.div
                        animate={{ scale: [1.2, 1, 1.2], x: [0, -40, 0], y: [0, -50, 0] }}
                        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] bg-[#083a2d] rounded-full blur-[120px] opacity-50"
                    />

                    <div className="relative h-full w-full flex flex-col items-center justify-center">
                        {/* Feature Cards */}
                        <div className="w-full max-w-sm space-y-8 relative">
                            {features.map((feature, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: 50 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.2 * idx, duration: 0.8 }}
                                    className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-[32px] group"
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <span className="text-xs font-black tracking-widest text-[#68e2bd] uppercase">{feature.tag}</span>
                                        <ShieldCheck className="w-5 h-5 text-[#68e2bd]" />
                                    </div>
                                    <div className="flex items-baseline gap-3 mb-2">
                                        <h3 className="text-5xl font-black text-white">{feature.metric}</h3>
                                    </div>
                                    <p className="text-xl font-bold text-white mb-1">{feature.title}</p>
                                    <p className="text-white/60 font-medium">{feature.description}</p>
                                </motion.div>
                            ))}

                            <div className="bg-zinc-950/40 p-6 rounded-2xl border border-white/5 flex items-center gap-4 mt-12">
                                <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center">
                                    <Zap className="w-5 h-5 text-orange-500" />
                                </div>
                                <p className="text-white/70 text-sm font-medium">B2B Verified Portal</p>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

export default JoinPropertyPage;
