/**
 * BuildingFloorsOverlay
 * Interactive SVG building facade with floor-level navigation.
 * @remarks Client component.
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/backend/lib/utils';
import { GlassCard } from '@/frontend/components/ui/glass-card';
import { Users, Zap, Thermometer, ShieldCheck, MapPin, Building2 } from 'lucide-react';

interface FloorData {
    id: number;
    name: string;
    usage: string;
    occupancy: number;
    status: 'optimal' | 'warning' | 'critical';
    temp: number;
    energy: number;
    units: number;
}

const floors: FloorData[] = Array.from({ length: 22 }, (_, i) => {
    const floorId = 22 - i;
    return {
        id: floorId,
        name: floorId === 22 ? "Penthouse" : floorId === 1 ? "Lobby" : `Level ${floorId}`,
        usage: floorId === 22 ? "HQ Suites" : floorId === 1 ? "Main Reception" : floorId % 4 === 0 ? "Conference Hub" : "Corporate Office",
        occupancy: Math.floor(Math.random() * 30) + 60,
        status: Math.random() > 0.85 ? 'warning' : 'optimal',
        temp: 21.5 + Math.random() * 2,
        energy: 120 + Math.random() * 50,
        units: Math.floor(Math.random() * 10) + 5
    };
});

export default function BuildingFloorsOverlay() {
    const [hoveredFloor, setHoveredFloor] = useState<number | null>(null);

    // SVG Geometry for a 3D Perspective Building Overlay
    const width = 1000;
    const height = 1000;

    // Perspective points (estimated for the building in the image)
    const topFloorL = { x: 504, y: 125 };
    const topFloorR = { x: 792, y: 114 };
    const bottomFloorL = { x: 490, y: 920 };
    const bottomFloorR = { x: 805, y: 885 };

    const renderFloorSVG = (index: number) => {
        const total = 22;
        // Calculate t for linear vertical distribution
        const t1 = index / total;
        const t2 = (index + 0.9) / total;

        const getPointL = (t: number) => ({
            x: topFloorL.x + (bottomFloorL.x - topFloorL.x) * t,
            y: topFloorL.y + (bottomFloorL.y - topFloorL.y) * t
        });

        const getPointR = (t: number) => ({
            x: topFloorR.x + (bottomFloorR.x - topFloorR.x) * t,
            y: topFloorR.y + (bottomFloorR.y - topFloorR.y) * t
        });

        const p1L = getPointL(t1);
        const p1R = getPointR(t1);
        const p2L = getPointL(t2);
        const p2R = getPointR(t2);

        const points = `${p1L.x},${p1L.y} ${p1R.x},${p1R.y} ${p2R.x},${p2R.y} ${p2L.x},${p2L.y}`;

        const floor = floors[index];
        const isHovered = hoveredFloor === floor.id;

        return (
            <motion.polygon
                key={floor.id}
                points={points}
                className={cn(
                    "cursor-pointer transition-all duration-300",
                    isHovered ? "fill-white/20 stroke-white/40" : "fill-white/0 stroke-transparent"
                )}
                onMouseEnter={() => setHoveredFloor(floor.id)}
                onMouseLeave={() => setHoveredFloor(null)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.05 }}
            />
        );
    };

    return (
        <div className="relative h-full w-full pointer-events-none">
            {/* 3D SVG Overlay Layer */}
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="absolute inset-0 w-full h-full"
                preserveAspectRatio="xMidYMid slice"
            >
                {Array.from({ length: 22 }).map((_, i) => renderFloorSVG(i))}
            </svg>

            {/* Left Sideview / Vertical Navigation */}
            <div className="absolute left-8 top-1/2 -translate-y-1/2 flex flex-col-reverse gap-[2px] pointer-events-auto">
                <div className="text-[10px] text-white/30 uppercase tracking-[0.2em] mb-4 -rotate-90 origin-bottom-left translate-x-4">Building Stack</div>
                {floors.map((f) => (
                    <div
                        key={f.id}
                        onMouseEnter={() => setHoveredFloor(f.id)}
                        onMouseLeave={() => setHoveredFloor(null)}
                        className={cn(
                            "h-1.5 w-12 rounded-[1px] cursor-pointer transition-all duration-300",
                            hoveredFloor === f.id ? "bg-blue-400 w-16 shadow-[0_0_10px_rgba(96,165,250,0.5)]" : "bg-white/10"
                        )}
                    />
                ))}
            </div>

            {/* Floating Detail Card */}
            <AnimatePresence>
                {hoveredFloor && (
                    <motion.div
                        initial={{ opacity: 0, x: 20, scale: 0.98 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: 20, scale: 0.98 }}
                        className="absolute right-12 top-14 w-80 pointer-events-auto"
                    >
                        <GlassCard className="p-6 border-white/20 bg-black/60 backdrop-blur-3xl shadow-2xl rounded-sm">
                            {/* Card Content */}
                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Building2 size={14} className="text-blue-400" />
                                            <h3 className="text-2xl font-light text-white tracking-tight">
                                                {floors.find(f => f.id === hoveredFloor)?.name}
                                            </h3>
                                        </div>
                                        <p className="text-[10px] text-white/40 uppercase tracking-[0.2em]">
                                            {floors.find(f => f.id === hoveredFloor)?.usage}
                                        </p>
                                    </div>
                                    <div className={cn(
                                        "w-2 h-2 rounded-full",
                                        floors.find(f => f.id === hoveredFloor)?.status === 'optimal' ? "bg-emerald-500" : "bg-amber-500"
                                    )} />
                                </div>

                                <div className="grid grid-cols-2 gap-x-8 gap-y-6 mb-8 mt-2">
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                            <Users size={10} /> Occupancy
                                        </div>
                                        <div className="text-xl text-white font-medium">
                                            {floors.find(f => f.id === hoveredFloor)?.occupancy}%
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                            <Thermometer size={10} /> Temp
                                        </div>
                                        <div className="text-xl text-white font-medium">
                                            {floors.find(f => f.id === hoveredFloor)?.temp.toFixed(1)}°
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                            <Zap size={10} /> Energy
                                        </div>
                                        <div className="text-xl text-white font-medium">
                                            {floors.find(f => f.id === hoveredFloor)?.energy.toFixed(0)} <span className="text-[10px] text-white/40">kW</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[9px] text-white/30 uppercase tracking-[0.15em] flex items-center gap-1.5">
                                            <MapPin size={10} /> Entities
                                        </div>
                                        <div className="text-xl text-white font-medium italic font-serif">
                                            {floors.find(f => f.id === hoveredFloor)?.units}
                                        </div>
                                    </div>
                                </div>

                                <button className="w-full py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-sm text-[10px] text-white uppercase tracking-[0.2em] transition-all">
                                    Floor Detail View
                                </button>
                            </div>
                        </GlassCard>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
