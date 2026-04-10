/**
 * Loader
 * Spinner/loading indicator component.
 * @remarks UI primitive.
 */

'use client';

import React, { useState } from 'react';

// Simple CSS-based loader as fallback
const CssLoader = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' | 'xl' }) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10', 
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  return (
    <div className={`${sizeClasses[size]} border-4 border-violet-500 border-t-transparent rounded-full animate-spin`}></div>
  );
};

// Base64 encoded simple spinner SVG
const spinnerSvg = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIgcj0iNDAiIHN0cm9rZT0iIzhCNTBGMCIgc3Ryb2tlLXdpZHRoPSI4IiBmaWxsPSJub25lIiBzdHJva2UtZGFzaGFycmF5PSIxMjUuNjY0IDQxLjg4NzkiPgogICAgPGFuaW1hdGUgYXR0cmlidXRlTmFtZT0ic3Ryb2tlLWRhc2hhcnJheSIgZHVyPSIycyIgdmFsdWVzPSIxMjUuNjY0IDQxLjg4NzsgMCAxMjUuNjY0IDQxLjg4NzsiIHJlcGVhdENvdW50PSJpbmRlZmluaXRlIiAvPgogIDwvY2lyY2xlPgo8L3N2Zz4K";

interface LoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  text?: string;
}

const sizeClasses = {
  sm: 'w-8 h-8',
  md: 'w-12 h-12',
  lg: 'w-20 h-20',
  xl: 'w-32 h-32',
};

export default function Loader({ size = 'md', className = '', text }: LoaderProps) {
  const [imageError, setImageError] = useState(false);

  // Try to load the image, fallback to CSS spinner if it fails
  return (
    <div className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      {!imageError ? (
        <div className={`${sizeClasses[size]} custom-loader-spin flex items-center justify-center`}>
          <img
            src="/loader-icon.jpg"
            alt="Loading..."
            className="w-full h-full object-contain"
            onError={() => {
              console.error('❌ Failed to load custom loader image');
              console.error('Falling back to CSS spinner');
              setImageError(true);
            }}
            onLoad={() => {
              console.log('✅ Custom loader image loaded successfully');
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <CssLoader size={size} />
          <p className="text-slate-500 text-xs mt-2">Using fallback spinner</p>
        </div>
      )}
      {text && (
        <p className={`text-text-secondary font-medium text-sm ${imageError ? 'animate-pulse' : ''}`}>
          {text}
        </p>
      )}
    </div>
  );
}

// Alternative: Pure CSS loader with gradient
export function GradientLoader({ size = 'md', text }: { size?: 'sm' | 'md' | 'lg' | 'xl'; text?: string }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-20 h-20',
    xl: 'w-32 h-32'
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`${sizeClasses[size]} rounded-full border-4 border-transparent border-t-violet-500 border-r-violet-300 animate-spin`}></div>
      {text && <p className="text-text-secondary font-medium text-sm animate-pulse">{text}</p>}
    </div>
  );
}