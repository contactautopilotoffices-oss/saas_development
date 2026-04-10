/**
 * LiquidDieselGauge
 * Visual gauge component displaying diesel tank level as percentage.
 * @remarks Client component.
 */

'use client';

import React from 'react';
import LiquidFillGauge from 'react-liquid-gauge';

interface LiquidDieselGaugeProps {
    /** Value between 0-100 representing fill percentage */
    value: number;
    /** Size in pixels (width and height) */
    size?: number;
    /** Tank capacity for label display */
    tankCapacity?: number;
    /** Current litres consumed */
    consumedLitres?: number;
    /** Label to display (e.g., "DG-1") */
    label?: string;
    /** Whether to use dark theme colors */
    isDark?: boolean;
}

/**
 * Animated liquid gauge for diesel consumption visualization
 * Uses golden/amber color scheme as per user preference
 */
const LiquidDieselGauge: React.FC<LiquidDieselGaugeProps> = ({
    value,
    size = 180,
    tankCapacity,
    consumedLitres,
    label,
    isDark = false,
}) => {
    // Clamp value between 0-100
    const clampedValue = Math.max(0, Math.min(100, value));

    // Primary color palette (Muted Sky Blue)
    const getColors = (val: number) => {
        // Diesel is typically amber/gold
        return {
            fill: '#F59E0B',     // Amber-500
            wave: '#FBBF24',     // Amber-400
            text: '#B45309',     // Amber-700
        };
    };

    const colors = getColors(clampedValue);

    return (
        <div className="flex flex-col items-center">
            <LiquidFillGauge
                width={size}
                height={size}
                value={clampedValue}
                textSize={1}
                textOffsetX={0}
                textOffsetY={0}
                riseAnimation
                waveAnimation
                waveFrequency={2}
                waveAmplitude={3}
                gradient
                gradientStops={[
                    { key: '0%', stopColor: colors.wave, stopOpacity: 1, offset: '0%' },
                    { key: '100%', stopColor: colors.fill, stopOpacity: 1, offset: '100%' },
                ]}
                circleStyle={{
                    fill: isDark ? '#0d1117' : '#F1F5F9', // Slate-100
                }}
                waveStyle={{
                    fill: colors.fill,
                }}
                textStyle={{
                    fill: isDark ? '#FFF' : colors.text,
                    fontFamily: 'Space Grotesk, system-ui, sans-serif',
                    fontWeight: 700,
                }}
                waveTextStyle={{
                    fill: '#F8FAFC', // Light text on wave
                    fontFamily: 'Space Grotesk, system-ui, sans-serif',
                    fontWeight: 700,
                }}
            />
            {label && (
                <p className={`mt-2 text-sm font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>{label}</p>
            )}
            {consumedLitres !== undefined && tankCapacity !== undefined && (
                <p className={`text-xs ${isDark ? 'text-slate-500' : 'text-slate-500'} mt-1`}>
                    <span className={`font-bold ${isDark ? 'text-emerald-500' : 'text-primary'}`}>{consumedLitres}L</span>
                    <span className={`${isDark ? 'text-slate-600' : 'text-slate-400'}`}> / {tankCapacity}L</span>
                </p>
            )}
        </div>
    );
};

export default LiquidDieselGauge;
