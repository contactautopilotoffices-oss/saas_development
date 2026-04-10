'use client';

import { useState, useEffect } from 'react';

export default function SimpleLoaderTest() {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-white">
      <h1 className="text-3xl font-bold mb-8">Simple Loader Test</h1>
      
      <div className="bg-slate-800 p-8 rounded-xl mb-8 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Direct Image Test</h2>
        <div className="flex justify-center mb-4">
          <img
            src="/loader-icon.jpg"
            alt="Loading test"
            className="w-24 h-24"
            onLoad={() => {
              setImageLoaded(true);
              console.log('✅ Image loaded successfully');
            }}
            onError={() => {
              setImageError(true);
              console.error('❌ Image failed to load');
              console.error('Current path:', window.location.href);
              console.error('Image src:', '/loader-icon.jpg');
            }}
          />
        </div>
        <div className="text-center">
          <p>Status: {imageLoaded ? '✅ Loaded' : imageError ? '❌ Failed' : '⏳ Loading...'}</p>
        </div>
      </div>

      <div className="bg-slate-800 p-8 rounded-xl w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Manual Test</h2>
        <p className="mb-4">Try accessing the image directly:</p>
        <a 
          href="/loader-icon.jpg" 
          target="_blank" 
          className="text-blue-400 underline hover:text-blue-300"
        >
          Click here to view /loader-icon.jpg
        </a>
        <p className="mt-4 text-sm text-slate-400">
          If this link shows a broken image, the file is corrupted or inaccessible.
        </p>
      </div>

      <div className="mt-8 text-center text-slate-400">
        <p>Check browser console (F12) for detailed error messages</p>
      </div>
    </div>
  );
}