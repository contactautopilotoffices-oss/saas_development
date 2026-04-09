/**
 * Barcode
 * Barcode rendering component using CODE128 format.
 * @remarks Client component.
 */

"use client"

import { QRCodeSVG } from "qrcode.react"

interface BarcodeProps {
    value: string;
    size?: number;
    level?: "L" | "M" | "Q" | "H";
    includeMargin?: boolean;
    className?: string;
}

/**
 * Utility to download a code as a high-res QR PNG
 */
export const downloadBarcode = (value: string, fileName?: string) => {
    if (typeof window === "undefined") return;

    // Create a temporary canvas to render the QR
    const canvas = document.createElement("canvas");
    const size = 1024; // High resolution for professional printing
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");

    if (ctx) {
        // Find any existing QR SVG if available, or we'll have to render a hidden one
        const svg = document.querySelector(`[data-qr-value="${value}"]`) as SVGElement;

        const generateFromImg = (svgElement: SVGElement) => {
            const svgData = new XMLSerializer().serializeToString(svgElement);
            const img = new Image();
            img.onload = () => {
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, size, size);
                ctx.drawImage(img, 0, 0, size, size);
                const link = document.createElement("a");
                link.download = fileName || `qr-${value}.png`;
                link.href = canvas.toDataURL("image/png");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
        };

        if (svg) {
            generateFromImg(svg);
        } else {
            // If no SVG exists in DOM, we'd need another way, but for this app's flow, 
            // the QR is always rendered before download is available.
            console.warn("QR element not found in DOM for direct download");
        }
    }
};

export default function Barcode({
    value,
    size = 200,
    level = "H",
    includeMargin = true,
    className = ""
}: BarcodeProps) {
    if (!value) return null

    return (
        <div className={`flex justify-center bg-white p-4 rounded-2xl ${className}`}>
            <QRCodeSVG
                value={value}
                size={size}
                level={level}
                includeMargin={includeMargin}
                data-qr-value={value}
            />
        </div>
    )
}
