import type { Metadata, Viewport } from "next";
import { Poppins, Urbanist } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/frontend/context/AuthContext";
import { GlobalProvider } from "@/frontend/context/GlobalContext";
import { ThemeProvider } from "@/frontend/context/ThemeContext";
import { DataCacheProvider } from "@/frontend/context/DataCacheContext";
import { SessionProvider, CookieConsentToast } from "@/frontend/components/analytics";
import NotificationSystem from "@/frontend/components/ops/NotificationSystem";

const poppins = Poppins({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700", "800", "900"],
    variable: "--font-display",
    display: 'swap',
});

const urbanist = Urbanist({
    subsets: ["latin"],
    weight: ["300", "400", "500", "600", "700"],
    variable: "--font-body",
    display: 'swap',
});

export const metadata: Metadata = {
    title: "Autopilot | Facility Management on Autopilot",
    description: "Facilities that run without constant follow-ups. Fewer complaints. Faster fixes. Clear accountability. The operating system for modern buildings.",
    keywords: ["facility management", "building maintenance", "operations automation", "property management", "SaaS"],
    manifest: "/manifest.json",
};

export const viewport: Viewport = {
    themeColor: "#ffffff",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;

}>) {
    return (
        <html lang="en" className={`${poppins.variable} ${urbanist.variable}`} suppressHydrationWarning>
            <head>
                <link rel="manifest" href="/manifest.json" />
                <link
                    href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
                    rel="stylesheet"
                />
            </head>
            <body className="bg-background text-foreground antialiased overflow-x-hidden font-body">
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function() {
                                // One-time cache purge for Authentication cleanup
                                const PURGE_KEY = 'auth_cache_purge_v3';
                                if (!localStorage.getItem(PURGE_KEY)) {
                                    console.log('Antigravity: Performing one-time auth cache purge...');
                                    
                                    // 1. Clear specific stale auth keys
                                    localStorage.removeItem('rememberedEmail');
                                    localStorage.removeItem('rememberedPassword');
                                    localStorage.removeItem('rememberMe');
                                    
                                    // 2. Unregister ALL service workers to kill stale UI caches
                                    if ('serviceWorker' in navigator) {
                                        navigator.serviceWorker.getRegistrations().then(registrations => {
                                            for (let registration of registrations) {
                                                registration.unregister();
                                                console.log('Antigravity: Unregistered Service Worker:', registration);
                                            }
                                        });
                                    }
                                    
                                    localStorage.setItem(PURGE_KEY, 'true');
                                    console.log('Antigravity: Purge complete. Refreshing...');
                                    // Optional: window.location.reload(); 
                                }
                            })();
                        `,
                    }}
                />
                <ThemeProvider>
                    <AuthProvider>
                        <GlobalProvider>
                            <DataCacheProvider>
                                <SessionProvider>
                                    {children}
                                    <NotificationSystem />
                                    <CookieConsentToast />
                                </SessionProvider>
                            </DataCacheProvider>
                        </GlobalProvider>
                    </AuthProvider>
                </ThemeProvider>
            </body>
        </html>
    );
}
