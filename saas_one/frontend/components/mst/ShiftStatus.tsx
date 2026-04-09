/**
 * ShiftStatus - Shift check-in/check-out card component for the MST dashboard.
 *
 * Displays the current shift status (On Duty / Off Duty) with an informational message
 * explaining the implications of each state, and a prominent action button to toggle
 * the shift. Additionally exports `ShiftToast` — an animated toast notification that
 * plays a synthesized audio chime (Web Audio API) on success/error to provide audible
 * feedback when the shift state changes.
 *
 * @example
 * <ShiftStatus isCheckedIn={true} isLoading={false} onToggle={handleToggle} />
 *
 * @example Toast usage
 * <ShiftToast message="Shift started!" type="success" visible={showToast} />
 */
'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, LogOut, Clock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ShiftStatusProps {
  isCheckedIn: boolean;
  isLoading: boolean;
  onToggle: () => void;
}

export default function ShiftStatus({ isCheckedIn, isLoading, onToggle }: ShiftStatusProps) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isCheckedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
          <h3 className="font-semibold text-foreground">Shift Status</h3>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${isCheckedIn ? 'bg-green-500/10 text-green-600' : 'bg-gray-100 text-gray-500'
          }`}>
          {isCheckedIn ? 'ON DUTY' : 'OFF DUTY'}
        </span>
      </div>

      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-background rounded-lg border border-border/50">
          <Clock className="w-5 h-5 text-muted-foreground mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {isCheckedIn ? 'Actively receiving tickets' : 'Shift currently inactive'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {isCheckedIn
                ? 'Your load is being balanced across active MSTs.'
                : 'Check in to start receiving new service requests.'}
            </p>
          </div>
        </div>

        <button
          onClick={onToggle}
          disabled={isLoading}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium transition-all ${isCheckedIn
              ? 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-200'
              : 'bg-primary text-primary-foreground hover:opacity-90 shadow-sm'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isCheckedIn ? (
            <>
              <LogOut className="w-4 h-4" />
              Check Out
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              Check In
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Sound utility using Web Audio API
const playShiftSound = (type: 'success' | 'error') => {
  if (typeof window === 'undefined' || !window.AudioContext) return;

  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (type === 'success') {
      // Check-in: Pleasant ascending chime
      oscillator.frequency.setValueAtTime(523.25, audioContext.currentTime); // C5
      oscillator.frequency.setValueAtTime(659.25, audioContext.currentTime + 0.1); // E5
      oscillator.frequency.setValueAtTime(783.99, audioContext.currentTime + 0.2); // G5
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    } else {
      // Check-out: Softer descending tone
      oscillator.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime + 0.15); // A4
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.25, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    }
  } catch (e) {
    console.log('Audio not supported');
  }
};

// Toast Component for Shift Updates with Sound
export const ShiftToast = ({ message, type, visible }: { message: string, type: 'success' | 'error', visible: boolean }) => {
  const hasPlayedRef = useRef(false);

  // Play sound when toast becomes visible
  useEffect(() => {
    if (visible && !hasPlayedRef.current) {
      playShiftSound(type);
      hasPlayedRef.current = true;
    }
    if (!visible) {
      hasPlayedRef.current = false;
    }
  }, [visible, type]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-border shadow-2xl min-w-[300px]"
        >
          {type === 'success' ? (
            <div className="relative">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              {/* Pulse animation for success */}
              <motion.div
                initial={{ scale: 1, opacity: 0.5 }}
                animate={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.6 }}
                className="absolute inset-0 rounded-full bg-green-500"
              />
            </div>
          ) : (
            <AlertCircle className="w-5 h-5 text-red-500" />
          )}
          <p className="text-sm font-medium text-foreground">{message}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

