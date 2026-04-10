/**
 * Frontend image compression utility for optimising uploads to Supabase Storage.
 *
 * Resizes images so the longest side does not exceed 1280 px, converts output to
 * WebP (by default), and iteratively reduces quality until the file is under the
 * target size threshold (800 KB by default). If quality reduction alone cannot
 * meet the size target, the image is further downscaled using a square-root
 * scale factor.
 *
 * @module image-compression
 * @see compressImage
 */

export interface CompressionOptions {
    maxWidth?: number;
    maxHeight?: number;
    quality?: number;
    format?: 'image/webp' | 'image/jpeg' | 'image/png';
    maxSizeKB?: number;
}

const MAX_SIZE_BYTES = 800 * 1024; // 800KB limit

export const compressImage = async (
    file: File,
    options: CompressionOptions = {}
): Promise<File> => {
    const {
        maxWidth = 1280,
        maxHeight = 1280,
        quality: initialQuality = 0.8,
        format = 'image/webp',
        maxSizeKB = 800
    } = options;

    const targetSizeBytes = maxSizeKB * 1024;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = async () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate aspect ratio and resize
                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                // Draw image to canvas
                ctx.drawImage(img, 0, 0, width, height);

                // Iteratively compress until under target size
                let quality = initialQuality;
                let blob: Blob | null = null;
                let attempts = 0;
                const maxAttempts = 10;

                while (attempts < maxAttempts) {
                    blob = await new Promise<Blob | null>((res) => {
                        canvas.toBlob((b) => res(b), format, quality);
                    });

                    if (!blob) {
                        reject(new Error('Canvas to Blob conversion failed'));
                        return;
                    }

                    // If under target size or quality is too low, stop
                    if (blob.size <= targetSizeBytes || quality <= 0.3) {
                        break;
                    }

                    // Reduce quality for next attempt
                    quality -= 0.1;
                    attempts++;
                }

                // If still too large after quality reduction, resize further
                if (blob && blob.size > targetSizeBytes && quality <= 0.3) {
                    const scaleFactor = Math.sqrt(targetSizeBytes / blob.size);
                    const newWidth = Math.round(width * scaleFactor);
                    const newHeight = Math.round(height * scaleFactor);

                    canvas.width = newWidth;
                    canvas.height = newHeight;
                    ctx.drawImage(img, 0, 0, newWidth, newHeight);

                    blob = await new Promise<Blob | null>((res) => {
                        canvas.toBlob((b) => res(b), format, 0.7);
                    });
                }

                if (!blob) {
                    reject(new Error('Final compression failed'));
                    return;
                }

                // Create new file from compressed blob
                const newFileName = file.name.replace(/\.[^/.]+$/, "") + ".webp";
                const compressedFile = new File([blob], newFileName, {
                    type: format,
                    lastModified: Date.now(),
                });

                console.log(`[Image Compression] Original: ${(file.size / 1024).toFixed(0)}KB -> Compressed: ${(compressedFile.size / 1024).toFixed(0)}KB (Quality: ${(quality * 100).toFixed(0)}%)`);

                resolve(compressedFile);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};
