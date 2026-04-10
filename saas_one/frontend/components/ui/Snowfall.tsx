/**
 * Snowfall
 * Animated snowfall particle effect for landing pages.
 * @remarks UI primitive.
 */

'use client';

import React, { useEffect, useState } from 'react';

interface Snowflake {
    id: number;
    left: number;
    size: number;
    duration: number;
    delay: number;
    opacity: number;
}

const Snowfall: React.FC<{ intensity?: number }> = ({ intensity = 50 }) => {
    const [snowflakes, setSnowflakes] = useState<Snowflake[]>([]);

    useEffect(() => {
        const flakes: Snowflake[] = [];
        for (let i = 0; i < intensity; i++) {
            flakes.push({
                id: i,
                left: Math.random() * 100,
                size: Math.random() * 4 + 2,
                duration: Math.random() * 5 + 5,
                delay: Math.random() * 5,
                opacity: Math.random() * 0.6 + 0.4,
            });
        }
        setSnowflakes(flakes);
    }, [intensity]);

    return (
        <div className="snowfall-container">
            {snowflakes.map((flake) => (
                <div
                    key={flake.id}
                    className="snowflake"
                    style={{
                        left: `${flake.left}%`,
                        width: `${flake.size}px`,
                        height: `${flake.size}px`,
                        animationDuration: `${flake.duration}s`,
                        animationDelay: `${flake.delay}s`,
                        opacity: flake.opacity,
                    }}
                />
            ))}
            <style jsx>{`
                .snowfall-container {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    pointer-events: none;
                    z-index: 9999;
                    overflow: hidden;
                }

                .snowflake {
                    position: absolute;
                    top: -10px;
                    background: white;
                    border-radius: 50%;
                    box-shadow: 
                        0 0 10px rgba(255, 255, 255, 0.8),
                        0 0 20px rgba(255, 255, 255, 0.4);
                    animation: snowfall linear infinite;
                }

                @keyframes snowfall {
                    0% {
                        transform: translateY(-10px) rotate(0deg);
                    }
                    100% {
                        transform: translateY(100vh) rotate(360deg);
                    }
                }

                /* Add gentle horizontal sway */
                .snowflake:nth-child(odd) {
                    animation: snowfall-sway linear infinite;
                }

                @keyframes snowfall-sway {
                    0% {
                        transform: translateY(-10px) translateX(0px) rotate(0deg);
                    }
                    25% {
                        transform: translateY(25vh) translateX(15px) rotate(90deg);
                    }
                    50% {
                        transform: translateY(50vh) translateX(-10px) rotate(180deg);
                    }
                    75% {
                        transform: translateY(75vh) translateX(20px) rotate(270deg);
                    }
                    100% {
                        transform: translateY(100vh) translateX(0px) rotate(360deg);
                    }
                }
            `}</style>
        </div>
    );
};

export default Snowfall;
