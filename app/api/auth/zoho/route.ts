import { NextResponse } from 'next/server';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const redirect = requestUrl.searchParams.get('redirect') || '';
    const propertyCode = requestUrl.searchParams.get('propertyCode') || '';

    const state = Buffer.from(JSON.stringify({ redirect, propertyCode })).toString('base64');

    const zohoAuthUrl = new URL('https://accounts.zoho.com/oauth/v2/auth');
    zohoAuthUrl.searchParams.set('client_id', process.env.ZOHO_CLIENT_ID!);
    zohoAuthUrl.searchParams.set('response_type', 'code');
    zohoAuthUrl.searchParams.set('redirect_uri', `${requestUrl.origin}/api/auth/zoho/callback`);
    zohoAuthUrl.searchParams.set('scope', 'openid profile email');
    zohoAuthUrl.searchParams.set('access_type', 'online');
    zohoAuthUrl.searchParams.set('state', state);

    return NextResponse.redirect(zohoAuthUrl.toString());
}
