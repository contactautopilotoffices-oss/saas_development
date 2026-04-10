/**
 * ModernClock
 * Real-time digital clock component.
 * @remarks UI primitive.
 */

'use client';

import React, { useState, useEffect } from 'react';

/**
 * Modern Circular Clock with rotating rings
 * Shows months, days of week, and date numbers in concentric circles
 */
const ModernClock: React.FC<{ size?: number }> = ({ size = 280 }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const interval = setInterval(() => {
            setTime(new Date());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const seconds = time.getSeconds();
    const minutes = time.getMinutes();
    const hours = time.getHours() % 12;
    const day = time.getDay(); // 0-6 (Sun-Sat)
    const date = time.getDate(); // 1-31
    const month = time.getMonth(); // 0-11

    // Rotation angles
    const secondsRotation = seconds * 6; // 360/60 = 6 degrees per second
    const minutesRotation = minutes * 6 + seconds * 0.1;
    const hoursRotation = hours * 30 + minutes * 0.5; // 360/12 = 30 degrees per hour

    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const dates = Array.from({ length: 31 }, (_, i) => i + 1);

    const center = size / 2;
    const outerRadius = size / 2 - 10;
    const monthRadius = outerRadius - 5;
    const dateRadius = outerRadius - 30;
    const dayRadius = outerRadius - 55;
    const clockRadius = outerRadius - 85;

    // Helper to position text around a circle
    const getPosition = (angle: number, radius: number) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        return {
            x: center + radius * Math.cos(rad),
            y: center + radius * Math.sin(rad),
        };
    };

    return (
        <div
            className="relative"
            style={{ width: size, height: size }}
        >
            <svg width={size} height={size} className="drop-shadow-2xl">
                {/* Background circle */}
                <circle
                    cx={center}
                    cy={center}
                    r={outerRadius}
                    fill="#1e293b"
                    stroke="#334155"
                    strokeWidth="2"
                />

                {/* Months ring */}
                {months.map((m, i) => {
                    const angle = (i * 30) - 90; // 12 months, 30 degrees each
                    const pos = getPosition(angle + 15, monthRadius);
                    const isActive = i === month;
                    return (
                        <text
                            key={m}
                            x={pos.x}
                            y={pos.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={`text-[8px] font-bold tracking-wider ${isActive ? 'fill-amber-400' : 'fill-slate-500'}`}
                            style={{
                                transform: `rotate(${angle + 15 + 90}deg)`,
                                transformOrigin: `${pos.x}px ${pos.y}px`,
                            }}
                        >
                            {m}
                        </text>
                    );
                })}

                {/* Dates ring */}
                {dates.map((d) => {
                    const angle = ((d - 1) * (360 / 31)) - 90;
                    const pos = getPosition(angle, dateRadius);
                    const isActive = d === date;
                    return (
                        <text
                            key={`date-${d}`}
                            x={pos.x}
                            y={pos.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={`text-[7px] font-bold ${isActive ? 'fill-amber-400' : 'fill-slate-400'}`}
                        >
                            {d.toString().padStart(2, '0')}
                        </text>
                    );
                })}

                {/* Days ring */}
                {days.map((d, i) => {
                    const angle = (i * (360 / 7)) - 90;
                    const pos = getPosition(angle + 25, dayRadius);
                    const isActive = i === day;
                    const colors: Record<string, string> = {
                        SUN: 'fill-rose-400',
                        MON: 'fill-cyan-400',
                        TUE: 'fill-cyan-400',
                        WED: 'fill-cyan-400',
                        THU: 'fill-cyan-400',
                        FRI: 'fill-cyan-400',
                        SAT: 'fill-amber-400',
                    };
                    return (
                        <text
                            key={d}
                            x={pos.x}
                            y={pos.y}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            className={`text-[9px] font-black tracking-widest ${isActive ? colors[d] : 'fill-slate-600'}`}
                            style={{
                                transform: `rotate(${angle + 25 + 90}deg)`,
                                transformOrigin: `${pos.x}px ${pos.y}px`,
                            }}
                        >
                            {d}
                        </text>
                    );
                })}

                {/* Clock face background */}
                <circle
                    cx={center}
                    cy={center}
                    r={clockRadius}
                    fill="#0f172a"
                    stroke="#334155"
                    strokeWidth="1"
                />

                {/* Hour markers */}
                {[...Array(12)].map((_, i) => {
                    const angle = (i * 30) - 90;
                    const innerPos = getPosition(angle, clockRadius - 8);
                    const outerPos = getPosition(angle, clockRadius - 3);
                    return (
                        <line
                            key={`hour-${i}`}
                            x1={innerPos.x}
                            y1={innerPos.y}
                            x2={outerPos.x}
                            y2={outerPos.y}
                            stroke="#64748b"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Hour hand */}
                <line
                    x1={center}
                    y1={center}
                    x2={center}
                    y2={center - clockRadius * 0.5}
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    style={{
                        transform: `rotate(${hoursRotation}deg)`,
                        transformOrigin: `${center}px ${center}px`,
                        transition: 'transform 0.5s ease-out',
                    }}
                />

                {/* Minute hand */}
                <line
                    x1={center}
                    y1={center}
                    x2={center}
                    y2={center - clockRadius * 0.7}
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    style={{
                        transform: `rotate(${minutesRotation}deg)`,
                        transformOrigin: `${center}px ${center}px`,
                        transition: 'transform 0.1s ease-out',
                    }}
                />

                {/* Second hand */}
                <line
                    x1={center}
                    y1={center + 10}
                    x2={center}
                    y2={center - clockRadius * 0.75}
                    stroke="#f59e0b"
                    strokeWidth="1"
                    strokeLinecap="round"
                    style={{
                        transform: `rotate(${secondsRotation}deg)`,
                        transformOrigin: `${center}px ${center}px`,
                    }}
                />

                {/* Center dot */}
                <circle
                    cx={center}
                    cy={center}
                    r="4"
                    fill="#f59e0b"
                />
                <circle
                    cx={center}
                    cy={center}
                    r="2"
                    fill="white"
                />
            </svg>

            {/* Glow effect */}
            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    background: `radial-gradient(circle at center, rgba(245, 158, 11, 0.1) 0%, transparent 50%)`,
                }}
            />
        </div>
    );
};

export default ModernClock;
