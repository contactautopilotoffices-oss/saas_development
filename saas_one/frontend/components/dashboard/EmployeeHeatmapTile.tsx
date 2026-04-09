/**
 * EmployeeHeatmapTile
 * Floor-level occupancy heatmap showing employee distribution across floors.
 * @remarks Client component.
 */

'use client';

import React from 'react';

interface EmployeeHeatmapTileProps {
    occupancyPercentage: number;
}

export default function EmployeeHeatmapTile({ occupancyPercentage }: EmployeeHeatmapTileProps) {
    return (
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between h-full">
            <div>
                <h3 className="text-[#1a2b3c] font-bold text-xl mb-4">Occupancy Heatmap</h3>
                <div className="flex items-end gap-4 mb-4">
                    <span className="text-4xl font-bold text-[#2d3748]">{occupancyPercentage}%</span>
                    <span className="text-[#718096] text-lg mb-1">Capacity</span>
                </div>

                {/* Simplified Heatmap Visual */}
                <div className="grid grid-cols-10 gap-1 mt-4">
                    {Array.from({ length: 20 }).map((_, i) => (
                        <div
                            key={i}
                            className={`h-6 rounded-sm ${i < 4 ? 'bg-[#ff7675]' :
                                    i < 10 ? 'bg-[#fab1a0]' :
                                        i < 16 ? 'bg-[#ffeaa7]' :
                                            'bg-[#55efc4]'
                                }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
