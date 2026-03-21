import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(request: NextRequest) {
    console.log('eSSL API Route Hit');
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const path = searchParams.get('path') || 'api/v1/attendance_logs';

        // Basic validation for path
        if (path.includes('..') || path.includes('://')) {
            return NextResponse.json({ error: 'Invalid path format' }, { status: 400 });
        }

        const serverUrl = process.env.ESSL_SERVER_URL;
        const apiKey = process.env.ESSL_API_KEY;

        if (!serverUrl || !apiKey) {
            return NextResponse.json({ 
                error: 'eSSL configuration missing in environment variables' 
            }, { status: 500 });
        }

        // Clean up the server URL to ensure no trailing slash
        const baseUrl = serverUrl.replace(/\/$/, '');
        // Construct the final URL using the path provided by the frontend
        const finalUrl = `${baseUrl}/${path.replace(/^\//, '')}${path.includes('?') ? '&' : '?'}api_key=${apiKey}`;
        
        console.log('Fetching from eSSL:', finalUrl.replace(apiKey, 'REDACTED'));

        const response = await fetch(finalUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            // Try to get text first if JSON fails (eSSL often returns HTML for 404s)
            const textContent = await response.text().catch(() => '');
            let errorData;
            try {
                errorData = JSON.parse(textContent);
            } catch {
                errorData = { message: textContent.substring(0, 500) };
            }

            return NextResponse.json({ 
                error: `eSSL Server returned ${response.status}`, 
                path,
                details: errorData 
            }, { status: response.status });
        }

        const data = await response.json();
        return NextResponse.json(data);

    } catch (error: any) {
        console.error('eSSL Proxy Error:', error);
        return NextResponse.json({ 
            error: 'Internal server error', 
            details: error.message 
        }, { status: 500 });
    }
}
 
