'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '@/frontend/components/ui/glass-card';
import { MousePointer2, TrendingUp, CheckCircle, Zap } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/backend/lib/utils';

// Premium Font Utility for "Söhne" feel (using Outfit variable)
const fontHeading = "font-outfit";
const fontUI = "font-inter"; 


export default function HeroSection() {
    const [isNight, setIsNight] = useState(false);

    // NOTE: Removed click state 'activeCard' in favor of CSS group-hover for smoother performance and "Hover" requirement.
    // However, if we want complex exit animations, we can use state. 
    // Given the requirement "change click to hover", CSS or simple state is fine.
    // Let's use State for AnimatePresence support on hover.

    useEffect(() => {
        const checkTime = () => {
            const hour = new Date().getHours();
            setIsNight(hour >= 18 || hour < 6);
        };

        checkTime();
        const interval = setInterval(checkTime, 60000);
        return () => clearInterval(interval);
    }, []);

    return (
        <section className={cn("relative h-screen w-full overflow-hidden bg-slate-950", fontUI)}>
            {/* Main Image */}
            <div className="absolute inset-0 z-0">
                <AnimatePresence mode="wait">
                    {/* 
                      NOTE: User requested higher res images. 
                      Since I cannot generate 4K images, I am using the best available 'quality={100}' 
                      and using a slight scale animation to keep it alive.
                     */}
                    <motion.div
                        key={isNight ? 'night' : 'day'}
                        initial={{ opacity: 0, scale: 1.05 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 2.5 }}
                        className="absolute inset-0"
                    >
                        <Image
                            src={isNight ? "/landing-hero-night.jpg" : "/landing-hero-day.jpg"}
                            alt="Modern Office Building"
                            fill
                            className="object-cover object-center"
                            priority
                            quality={100}
                        />
                    </motion.div>
                </AnimatePresence>
                <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/20 to-transparent" />
            </div>

            {/* Content Overlay */}
            <div className="absolute inset-0 z-20 flex flex-col justify-between pt-4 md:pt-6 lg:pt-8 px-8 md:px-12 lg:px-14 pb-12 md:pb-16">
                <header className="flex justify-between items-center w-full pointer-events-auto bg-transparent -mt-[10px]">
                    <div className="flex items-center text-white">
                        {/* Brand Logo */}
                        <div className="flex items-center group cursor-pointer">
                            <Image
                                src="/autopilot-logo-new.png"
                                alt="Autopilot Logo"
                                width={240}
                                height={80}
                                className="object-contain invert mix-blend-screen"
                                priority
                            />
                        </div>
                    </div>
                    <div className="flex gap-8 items-center">
                        <Link href="/login">
                            <button className="px-8 py-3 bg-white text-black font-black rounded-sm hover:bg-zinc-200 transition-colors text-[10px] uppercase tracking-[0.2em] shadow-2xl">
                                Log In
                            </button>
                        </Link>
                    </div>
                </header>

                <div className="max-w-2xl mt-auto mb-16 pointer-events-none">
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 1, delay: 0.5 }}
                    >
                        <h1 className={cn("text-4xl md:text-6xl lg:text-7xl font-light text-white leading-[1.1] mb-6 tracking-tight", fontHeading)}>
                            Where Autonomy <span className="font-semibold text-white/95">Meets Operations.</span>
                        </h1>
                        <div className="flex items-center gap-3 text-white/60 text-xs md:text-sm tracking-wide pl-2 border-l border-white/20 font-body">
                            The building is the interface.
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
}
