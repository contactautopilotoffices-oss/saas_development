/**
 * Zoho OAuth callback API.
 * Handles OAuth callback, exchanges code for tokens, creates/retrieves user,
 * sets session, and redirects to appropriate dashboard.
 * Auth: Open (OAuth callback).
 */
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/frontend/utils/supabase/admin';
import { createClient } from '@/frontend/utils/supabase/server';

export async function GET(request: Request) {
    const requestUrl = new URL(request.url);
    const code = requestUrl.searchParams.get('code');
    const stateParam = requestUrl.searchParams.get('state');
    const error = requestUrl.searchParams.get('error');

    let appOrigin = requestUrl.origin || process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');

    if (error || !code) {
        console.error('[ZOHO] OAuth error:', error);
        return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
    }

    try {
        // Parse state (redirect + propertyCode)
        let redirect = '';
        let propertyCode = '';
        if (stateParam) {
            try {
                const state = JSON.parse(Buffer.from(stateParam, 'base64').toString());
                redirect = state.redirect || '';
                propertyCode = state.propertyCode || '';
                if (state.origin) appOrigin = state.origin.replace(/\/$/, '');
            } catch {
                // ignore malformed state
            }
        }

        // 1. Exchange Zoho code for access token
        const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: process.env.ZOHO_CLIENT_ID!,
                client_secret: process.env.ZOHO_CLIENT_SECRET!,
                redirect_uri: `${appOrigin}/api/auth/zoho/callback`,
                grant_type: 'authorization_code',
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) {
            console.error('[ZOHO] token exchange failed:', tokenData);
            return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
        }

        // 2. Get user info from Zoho
        const userRes = await fetch('https://accounts.zoho.com/oauth/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        const zohoUser = await userRes.json();
        const email: string = zohoUser.email;
        const fullName: string = zohoUser.name || zohoUser.given_name || email?.split('@')[0] || 'User';
        const avatarUrl: string = zohoUser.picture || '';

        if (!email) {
            console.error('[ZOHO] no email from Zoho');
            return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
        }

        const supabaseAdmin = createAdminClient();

        // 3. Create user if they don't exist yet
        const { data: existingUser } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('email', email)
            .maybeSingle();

        if (!existingUser?.id) {
            const { error: createError } = await supabaseAdmin.auth.admin.createUser({
                email,
                email_confirm: true,
                user_metadata: {
                    full_name: fullName,
                    avatar_url: avatarUrl,
                    provider: 'zoho',
                },
            });
            if (createError) {
                console.error('[ZOHO] create user failed:', createError.message);
                return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
            }
        }

        // 4. Generate magic link (admin, no PKCE — returns raw token in action_link)
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: {
                redirectTo: appOrigin
            }
        });

        if (linkError || !linkData?.properties?.action_link) {
            console.error('[ZOHO] generateLink failed:', linkError?.message);
            return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
        }

        // 5. GET the action_link server-side with redirect:manual
        //    GoTrue verifies the token and returns a redirect with session tokens in the
        //    Location header hash (#access_token=...) — no browser or PKCE needed
        const actionRes = await fetch(linkData.properties.action_link, {
            redirect: 'manual',
        });

        const location = actionRes.headers.get('location') ?? '';
        console.log('[ZOHO] action_link status:', actionRes.status, '| location prefix:', location.substring(0, 80));

        let access_token: string | null = null;
        let refresh_token: string | null = null;

        if (location.includes('#')) {
            // Implicit flow — tokens in hash fragment
            const hash = location.split('#')[1] ?? '';
            const hashParams = new URLSearchParams(hash);
            access_token = hashParams.get('access_token');
            refresh_token = hashParams.get('refresh_token');
        }

        if (!access_token || !refresh_token) {
            console.error('[ZOHO] no tokens in action_link redirect. location:', location.substring(0, 120));
            return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
        }

        // 6. Set session in cookies via SSR client
        const supabase = await createClient();
        const { data: { user }, error: sessionError } = await supabase.auth.setSession({
            access_token,
            refresh_token,
        });

        if (sessionError || !user) {
            console.error('[ZOHO] setSession failed:', sessionError?.message);
            return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
        }

        // 7. Upsert user profile
        const { data: dbUser, error: profileError } = await supabase.from('users').upsert({
            id: user.id,
            full_name: user.user_metadata.full_name || fullName,
            email: user.email!,
            phone: user.phone || null,
            metadata: user.user_metadata,
        }).select('is_master_admin, onboarding_completed').single();

        if (profileError) console.error('[ZOHO] profile upsert error:', profileError.message);

        // 8. Role-based routing
        if (dbUser?.is_master_admin || user.user_metadata?.is_master_admin) {
            return NextResponse.redirect(`${appOrigin}${redirect || '/master'}`);
        }

        const { data: orgMembership } = await supabase
            .from('organization_memberships')
            .select('organization_id, role')
            .eq('user_id', user.id)
            .eq('role', 'org_super_admin')
            .eq('is_active', true)
            .maybeSingle();

        if (orgMembership) {
            return NextResponse.redirect(
                `${appOrigin}${redirect || `/org/${orgMembership.organization_id}/dashboard`}`
            );
        }

        if (propertyCode) {
            const { data: property } = await supabase
                .from('properties')
                .select('id, organization_id')
                .eq('code', propertyCode)
                .maybeSingle();

            if (property) {
                await supabase.from('property_memberships').insert({
                    user_id: user.id,
                    organization_id: property.organization_id,
                    property_id: property.id,
                    role: 'tenant',
                });
                return NextResponse.redirect(`${appOrigin}/onboarding`);
            }
        }

        const { data: propMembership } = await supabase
            .from('property_memberships')
            .select('property_id, organization_id, role')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .maybeSingle();

        if (propMembership) {
            const role = propMembership.role;
            const pId = propMembership.property_id;

            const roleRoutes: Record<string, string> = {
                property_admin: `/property/${pId}/dashboard`,
                tenant: `/property/${pId}/tenant`,
                security: `/property/${pId}/security`,
                soft_service_manager: `/property/${pId}/dashboard`,
                staff: `/property/${pId}/staff`,
                mst: `/property/${pId}/mst`,
                vendor: `/property/${pId}/vendor`,
            };

            return NextResponse.redirect(
                `${appOrigin}${redirect || roleRoutes[role] || `/property/${pId}/dashboard`}`
            );
        }

        if (!dbUser?.onboarding_completed) {
            return NextResponse.redirect(`${appOrigin}/onboarding`);
        }

        return NextResponse.redirect(`${appOrigin}/login?error=no_access`);

    } catch (err) {
        console.error('[ZOHO] callback error:', err);
        return NextResponse.redirect(`${appOrigin}/login?error=auth_failed`);
    }
}
