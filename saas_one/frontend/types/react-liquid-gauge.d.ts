declare module 'react-liquid-gauge' {
    import React from 'react';

    interface GradientStop {
        key: string;
        stopColor: string;
        stopOpacity: number;
        offset: string;
    }

    interface LiquidFillGaugeProps {
        width?: number;
        height?: number;
        value?: number;
        percent?: string;
        textSize?: number;
        textOffsetX?: number;
        textOffsetY?: number;
        textRenderer?: (props: { value: number; width: number; height: number; textSize: number }) => React.ReactNode;
        riseAnimation?: boolean;
        riseAnimationTime?: number;
        riseAnimationEasing?: string;
        riseAnimationOnProgress?: (info: { value: number; container: SVGElement }) => void;
        riseAnimationComplete?: (info: { value: number; container: SVGElement }) => void;
        waveAnimation?: boolean;
        waveAnimationTime?: number;
        waveAnimationEasing?: string;
        waveFrequency?: number;
        waveAmplitude?: number;
        gradient?: boolean;
        gradientStops?: GradientStop[];
        onClick?: (event: React.MouseEvent) => void;
        innerRadius?: number;
        outerRadius?: number;
        margin?: number;
        circleStyle?: React.CSSProperties;
        waveStyle?: React.CSSProperties;
        textStyle?: React.CSSProperties;
        waveTextStyle?: React.CSSProperties;
    }

    const LiquidFillGauge: React.FC<LiquidFillGaugeProps>;
    export default LiquidFillGauge;
}
