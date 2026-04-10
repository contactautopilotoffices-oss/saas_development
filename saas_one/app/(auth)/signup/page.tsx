'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Redirect to unified auth page with signup mode
export default function SignupPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/login?mode=signup');
    }, [router]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-100 to-pink-100">
            <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
        </div>
    );
}
