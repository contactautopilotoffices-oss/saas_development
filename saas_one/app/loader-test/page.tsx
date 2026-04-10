'use client';

import Loader, { GradientLoader } from '@/frontend/components/ui/Loader';
import { useState } from 'react';

export default function LoaderTestPage() {
  const [testMode, setTestMode] = useState<'custom' | 'fallback' | 'gradient'>('custom');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-white mb-8 text-center">Loader Test Suite</h1>
        
        <div className="flex gap-4 mb-8 justify-center">
          <button 
            onClick={() => setTestMode('custom')}
            className={`px-4 py-2 rounded-lg font-medium ${
              testMode === 'custom' 
                ? 'bg-violet-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Custom Image
          </button>
          <button 
            onClick={() => setTestMode('fallback')}
            className={`px-4 py-2 rounded-lg font-medium ${
              testMode === 'fallback' 
                ? 'bg-violet-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Fallback Spinner
          </button>
          <button 
            onClick={() => setTestMode('gradient')}
            className={`px-4 py-2 rounded-lg font-medium ${
              testMode === 'gradient' 
                ? 'bg-violet-600 text-white' 
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            Gradient Spinner
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Small Size */}
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-4 text-center">Small (sm)</h2>
            <div className="flex justify-center">
              {testMode === 'custom' && <Loader size="sm" text="Loading..." />}
              {testMode === 'fallback' && <Loader size="sm" text="Fallback..." />}
              {testMode === 'gradient' && <GradientLoader size="sm" text="Gradient..." />}
            </div>
          </div>

          {/* Medium Size */}
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-4 text-center">Medium (md)</h2>
            <div className="flex justify-center">
              {testMode === 'custom' && <Loader size="md" text="Loading..." />}
              {testMode === 'fallback' && <Loader size="md" text="Fallback..." />}
              {testMode === 'gradient' && <GradientLoader size="md" text="Gradient..." />}
            </div>
          </div>

          {/* Large Size */}
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700">
            <h2 className="text-lg font-bold text-white mb-4 text-center">Large (lg)</h2>
            <div className="flex justify-center">
              {testMode === 'custom' && <Loader size="lg" text="Loading..." />}
              {testMode === 'fallback' && <Loader size="lg" text="Fallback..." />}
              {testMode === 'gradient' && <GradientLoader size="lg" text="Gradient..." />}
            </div>
          </div>
        </div>

        <div className="mt-12 bg-slate-800/70 p-6 rounded-xl border border-slate-700">
          <h3 className="text-lg font-bold text-white mb-3">Debug Information:</h3>
          <div className="text-slate-300 space-y-2">
            <p><strong>Current Test Mode:</strong> {testMode}</p>
            <p><strong>Expected Behavior:</strong></p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>Custom Image:</strong> Should show your logo rotating (if image loads)</li>
              <li><strong>Fallback:</strong> Shows CSS spinner with "Using fallback spinner" message</li>
              <li><strong>Gradient:</strong> Shows gradient-colored CSS spinner</li>
            </ul>
            <p className="mt-4"><strong>Check Console:</strong> Look for success/error messages about image loading</p>
          </div>
        </div>
      </div>
    </div>
  );
}