/**
 * Audio notification sound utility using the Web Audio API.
 *
 * Provides synthesised, browser-native sounds for UI feedback events such as
 * successful ticket creation ("tickle" sound) and general success confirmations.
 * No external audio assets are required; all sounds are generated programmatically
 * using oscillators and gain envelopes.
 *
 * Exported as a singleton (`soundPlayer`) and as convenience wrappers
 * (`playTickleSound`, `playSuccessSound`).
 *
 * @module sounds
 * @see soundPlayer
 * @see playTickleSound
 * @see playSuccessSound
 */

class SoundPlayer {
    private audioContext: AudioContext | null = null;

    private getAudioContext(): AudioContext {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        return this.audioContext;
    }

    /**
     * Play a success/tickle sound when ticket is created
     * Uses synthesized beeps for a pleasant notification sound
     */
    playTickleSound(): void {
        try {
            const ctx = this.getAudioContext();
            const now = ctx.currentTime;

            // Create a pleasant "tickle" sound with 3 quick ascending notes
            const notes = [523.25, 659.25, 783.99]; // C5, E5, G5 - major chord ascending
            const noteDuration = 0.08;
            const noteGap = 0.05;

            notes.forEach((freq, i) => {
                const oscillator = ctx.createOscillator();
                const gainNode = ctx.createGain();

                oscillator.connect(gainNode);
                gainNode.connect(ctx.destination);

                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(freq, now);

                const noteStart = now + i * (noteDuration + noteGap);
                const noteEnd = noteStart + noteDuration;

                // Envelope for smooth sound
                gainNode.gain.setValueAtTime(0, noteStart);
                gainNode.gain.linearRampToValueAtTime(0.15, noteStart + 0.01);
                gainNode.gain.linearRampToValueAtTime(0, noteEnd);

                oscillator.start(noteStart);
                oscillator.stop(noteEnd + 0.01);
            });
        } catch (error) {
            console.warn('Could not play sound:', error);
        }
    }

    /**
     * Play a simple success chime
     */
    playSuccessSound(): void {
        try {
            const ctx = this.getAudioContext();
            const now = ctx.currentTime;

            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, now); // A5
            oscillator.frequency.exponentialRampToValueAtTime(1760, now + 0.1); // A6

            gainNode.gain.setValueAtTime(0.2, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

            oscillator.start(now);
            oscillator.stop(now + 0.3);
        } catch (error) {
            console.warn('Could not play sound:', error);
        }
    }
}

// Singleton instance
export const soundPlayer = new SoundPlayer();

// Convenience function
export const playTickleSound = () => soundPlayer.playTickleSound();
export const playSuccessSound = () => soundPlayer.playSuccessSound();
