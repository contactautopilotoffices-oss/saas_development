'use client';

import Loader from '@/frontend/components/ui/Loader';
import { useState, useEffect } from 'react';

export default function TestLoaderPage() {
  const [showImage, setShowImage] = useState(false);
  
  useEffect(() => {
    // Simulate loading state
    const timer = setTimeout(() => setShowImage(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-white mb-12">Loader Test Page</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Test 1: Direct image */}
        <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Direct Image Test</h2>
          <div className="flex justify-center">
            <img 
              src="/loader-icon.jpg" 
              alt="Test" 
              className="w-20 h-20"
              onError={() => console.error('❌ Direct image failed')}
              onLoad={() => console.log('✅ Direct image loaded')}
            />
          </div>
          <p className="text-slate-400 mt-4 text-center">Testing if image loads directly</p>
        </div>

        {/* Test 2: Our Loader component */}
        <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Loader Component Test</h2>
          <div className="flex justify-center">
            <Loader size="lg" text="Testing..." />
          </div>
          <p className="text-slate-400 mt-4 text-center">Our custom loader component</p>
        </div>

        {/* Test 3: Traditional spinner */}
        <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Traditional Spinner</h2>
          <div className="flex justify-center">
            <div className="w-20 h-20 border-4 border-violet-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-slate-400 mt-4 text-center">Standard CSS spinner</p>
        </div>

        {/* Test 4: Fallback test */}
        <div className="bg-slate-800/50 p-8 rounded-2xl border border-slate-700">
          <h2 className="text-xl font-bold text-white mb-4">Fallback Test</h2>
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-violet-500 rounded-full flex items-center justify-center">
              <span className="text-white font-bold">LOGO</span>
            </div>
          </div>
          <p className="text-slate-400 mt-4 text-center">Static logo test</p>
        </div>
      </div>

      <div className="mt-12 bg-slate-800/70 p-6 rounded-xl border border-slate-700 max-w-2xl">
        <h3 className="text-lg font-bold text-white mb-3">Debug Instructions:</h3>
        <ol className="text-slate-300 space-y-2 list-decimal list-inside">
          <li>Open browser DevTools (F12)</li>
          <li>Check Console tab for error/loading messages</li>
          <li>Check Network tab for failed image requests</li>
          <li>If image loads in "Direct Image Test" but not in Loader, the issue is in the component</li>
          <li>If neither works, the image path is incorrect</li>
        </ol>
      </div>
    </div>
  );
}