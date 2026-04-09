import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Security headers for production hardening
 * These protect against common web vulnerabilities
 */
const securityHeaders = {
    // Prevent clickjacking attacks
    'X-Frame-Options': 'DENY',
    // Prevent MIME type sniffing
    'X-Content-Type-Options': 'nosniff',
    // Enable XSS filtering in older browsers
    'X-XSS-Protection': '1; mode=block',
    // Control referrer information
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // Restrict browser features/APIs
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
    // HTTP Strict Transport Security (enable in production with HTTPS)
    ...(process.env.NODE_ENV === 'production' ? {
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
    } : {}),
    // Content Security Policy - adjust based on your needs
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https://xvucakstcmtfoanmgcql.supabase.co",
        "media-src 'self' blob: https://xvucakstcmtfoanmgcql.supabase.co",
        "font-src 'self' data: https://fonts.gstatic.com",
        "connect-src 'self' http://localhost:3000 ws://localhost:3000 https://xvucakstcmtfoanmgcql.supabase.co wss://xvucakstcmtfoanmgcql.supabase.co https://www.gstatic.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://*.firebaseio.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
    ].join('; '),
}

export async function proxy(request: NextRequest) {
    const pathname = request.nextUrl.pathname

    // Define public routes that don't require authentication
    const publicRoutes = [
        '/login',
        '/signup',
        '/forgot-password',
        '/reset-password',
        '/join',
        '/api',        // API routes handle their own auth
        '/kiosk',
        '/onboarding', // Has its own client-side auth check
        '/_next',
        '/favicon.ico',
        '/manifest.json', // Allow manifest file for PWA
    ]

    // Check if current path is public
    const isPublicRoute = publicRoutes.some(route => pathname.startsWith(route)) || pathname === '/'

    // Create response
    let response = NextResponse.next()

    // Apply security headers to all responses
    Object.entries(securityHeaders).forEach(([key, value]) => {
        response.headers.set(key, value)
    })

    // 1. PUBLIC ROUTES: Bail out immediately to save overhead
    if (isPublicRoute && pathname !== '/login' && pathname !== '/signup') {
        return response
    }

    // 2. SUPABASE INITIALIZATION: Only happens for protected or auth routes
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    // If missing env vars, don't crash, just proceed
    if (!supabaseUrl || !supabaseAnonKey) {
        return response
    }

    const supabase = createServerClient(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                getAll() { return request.cookies.getAll() },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        request.cookies.set(name, value)
                    })
                    response = NextResponse.next({ request })
                    Object.entries(securityHeaders).forEach(([key, value]) => {
                        response.headers.set(key, value)
                    })
                    cookiesToSet.forEach(({ name, value, options }) => {
                        response.cookies.set(name, value, options)
                    })
                },
            },
        }
    )

    // 3. AUTH CHECK: getSession is ~0ms after the first load
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user ?? null

    // Redirect to login if user is not authenticated on a protected route
    if (!isPublicRoute && !user) {
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        return NextResponse.redirect(loginUrl)
    }

    // If user is authenticated and tries to access login/signup, redirect to home
    if (user && (pathname === '/login' || pathname === '/signup')) {
        const mode = request.nextUrl.searchParams.get('mode')
        if (!mode) {
            return NextResponse.redirect(new URL('/', request.url))
        }
    }

    return response
}

export default proxy

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico, manifest.json, sw.js (essential static files)
         * - api routes (each handles its own auth - adding middleware here adds ~200-500ms per request)
         * - public folder files
         */
        '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|/api/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|webmanifest)$).*)',
    ],
}
