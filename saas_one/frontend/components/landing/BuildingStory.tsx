/**
 * BuildingStory
 * Dark themed marketing section describing the product story.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { GlassCard } from '@/frontend/components/ui/glass-card';
import { CheckCircle2, ShoppingCart, BarChart3 } from 'lucide-react';
import Image from 'next/image';

export default function BuildingStory() {
    const features = [
        {
            icon: CheckCircle2,
            title: "Automated Workflows",
            desc: "Tasks move without follow-ups. Calm operational state.",
            color: "text-blue-400",
            bg: "bg-blue-500/20"
        },
        {
            icon: ShoppingCart,
            title: "Inventory & Procurement",
            desc: "Transparent approvals. Predictable purchasing.",
            color: "text-purple-400",
            bg: "bg-purple-500/20"
        },
        {
            icon: BarChart3,
            title: "Employee Heatmap",
            desc: "Floor-wise occupancy clarity. Real-time patterns.",
            color: "text-rose-400",
            bg: "bg-rose-500/20"
        }
    ];

    return (
        <section className="relative bg-slate-950 overflow-hidden py-32">
            {/* Background Image - Simplified */}
            <div className="absolute inset-0 z-0">
                <Image
                    src="/landing-hero.jpg"
                    alt="Building Detail"
                    fill
                    className="object-cover object-center opacity-20 blur-[2px]"
                />
                <div className="absolute inset-0 bg-slate-950/80" />
            </div>

            {/* Content */}
            <div className="relative z-10 max-w-7xl mx-auto px-6">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8 }}
                    viewport={{ once: true }}
                    className="text-center mb-24"
                >
                    <h2 className="text-3xl md:text-5xl font-light text-white mb-6">Transform Your Facility Management</h2>
                    <p className="text-white/60 max-w-2xl mx-auto">
                        A vertical operating system that turns every floor into a data point and every system into a managed asset.
                    </p>
                </motion.div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map((feature, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 50 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.2, duration: 0.8 }}
                            viewport={{ once: true }}
                        >
                            <GlassCard className="h-full p-8 hover:bg-white/10 transition-colors group cursor-pointer" intensity="low">
                                <div className={`w-12 h-12 rounded-2xl ${feature.bg} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                                    <feature.icon className={`w-6 h-6 ${feature.color}`} />
                                </div>
                                <h3 className="text-xl font-medium text-white mb-3">{feature.title}</h3>
                                <p className="text-white/60 leading-relaxed">
                                    {feature.desc}
                                </p>
                            </GlassCard>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
