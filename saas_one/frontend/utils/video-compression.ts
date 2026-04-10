/**
 * Frontend video compression utility for optimising uploads to Supabase Storage.
 *
 * Re-encodes video by drawing each frame onto a canvas at a reduced resolution
 * (max 480 px on the longest side) and recording the stream with a low bitrate
 * (500 Kbps). This produces WebM/VP8 output in most browsers, falling back to
 * MP4/H.264 where required. Autoplay-blocked or undecodable videos are returned
 * as-is rather than failing.
 *
 * @module video-compression
 * @see compressVideo
 */

const TARGET_MAX_DIMENSION = 480; // cap longest side at 480px
const TARGET_BITRATE = 500_000;   // 500 Kbps — gives ~0.9MB for a 15s clip
const TARGET_FPS = 24;

export const compressVideo = async (file: File): Promise<File> => {
    console.log(`[Video Compression] Initializing for ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, type: ${file.type})`);

    return new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.preload = 'auto';
        // Must be in the DOM — Chromium rejects blob URLs on detached video elements
        video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
        document.body.appendChild(video);

        const cleanup = (blobUrl: string) => {
            URL.revokeObjectURL(blobUrl);
            if (video.parentNode) video.parentNode.removeChild(video);
        };

        video.onloadedmetadata = async () => {
            try {
                // Scale down maintaining aspect ratio, capping longest side at 480px
                let width = video.videoWidth;
                let height = video.videoHeight;

                console.log(`[Video Compression] Metadata loaded: ${width}x${height} duration: ${video.duration}s`);

                if (width === 0 || height === 0) {
                    throw new Error('Video dimensions are 0. Failed to parse video data.');
                }

                if (width >= height) {
                    // Landscape or square
                    if (width > TARGET_MAX_DIMENSION) {
                        height = Math.round((height * TARGET_MAX_DIMENSION) / width);
                        width = TARGET_MAX_DIMENSION;
                    }
                } else {
                    // Portrait
                    if (height > TARGET_MAX_DIMENSION) {
                        width = Math.round((width * TARGET_MAX_DIMENSION) / height);
                        height = TARGET_MAX_DIMENSION;
                    }
                }

                // Ensure even dimensions (required for VP8/H.264)
                width = width % 2 === 0 ? width : width - 1;
                height = height % 2 === 0 ? height : height - 1;

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d')!;

                const canvasStream = canvas.captureStream(TARGET_FPS);

                // Prefer VP8 for best compression support across browsers
                const mimeTypes = [
                    'video/webm;codecs=vp8',
                    'video/webm',
                    'video/mp4',
                ];
                const selectedMime = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

                const recorder = new MediaRecorder(canvasStream, {
                    mimeType: selectedMime,
                    videoBitsPerSecond: TARGET_BITRATE,
                });

                const chunks: Blob[] = [];
                recorder.ondataavailable = (e) => {
                    if (e.data.size > 0) chunks.push(e.data);
                };

                recorder.onstop = () => {
                    cleanup(video.src);
                    const blob = new Blob(chunks, { type: selectedMime });
                    const ext = selectedMime.includes('mp4') ? 'mp4' : 'webm';
                    const compressedFile = new File([blob], `video_${Date.now()}.${ext}`, {
                        type: selectedMime.split(';')[0],
                        lastModified: Date.now(),
                    });

                    console.log(
                        `[Video Compression] ${(file.size / 1024 / 1024).toFixed(2)}MB → ` +
                        `${(compressedFile.size / 1024 / 1024).toFixed(2)}MB ` +
                        `(${width}x${height} @ ${TARGET_BITRATE / 1000}Kbps)`
                    );
                    resolve(compressedFile);
                };

                recorder.onerror = () => {
                    cleanup(video.src);
                    reject(new Error('Video compression recorder failed'));
                };

                // Play video and draw each frame onto canvas
                recorder.start();
                video.currentTime = 0;

                try {
                    await video.play();
                } catch (playErr: any) {
                    // Autoplay blocked by Permissions-Policy — skip compression, upload original
                    if (recorder.state === 'recording') recorder.stop();
                    cleanup(video.src);
                    console.warn('[Video Compression] Autoplay blocked, uploading original file:', playErr.message);
                    resolve(file);
                    return;
                }

                const drawFrame = () => {
                    if (video.ended || video.paused) {
                        if (recorder.state === 'recording') recorder.stop();
                        return;
                    }
                    ctx.drawImage(video, 0, 0, width, height);
                    requestAnimationFrame(drawFrame);
                };
                drawFrame();

                video.onended = () => {
                    if (recorder.state === 'recording') recorder.stop();
                };

            } catch (err) {
                console.error('[Video Compression] Processing error:', err);
                cleanup(video.src);
                reject(err);
            }
        };

        video.onerror = () => {
            // Browser blocked loading the blob (CSP / URL safety policy).
            // Recording is already at 500 Kbps / 640x480, so upload as-is.
            console.warn('[Video Compression] Could not load video for re-encoding, uploading original.');
            cleanup(video.src);
            resolve(file);
        };

        // Attach src last to ensure handlers are ready
        video.src = URL.createObjectURL(file);
        video.load();
    });
};
