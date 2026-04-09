/**
 * POST /api/webhooks/whatsapp
 * WhatsApp incoming message webhook receiver for WasenderAPI.
 * Handles text, image, video messages — creates tickets automatically with Groq classification.
 * Flow: (1) identify user by phone, (2) resolve property (multi-property users get a poll), (3) classify
 * via Groq, (4) create ticket with photo/video attachments, (5) attach escalation hierarchy,
 * (6) trigger notifications, (7) reply on WhatsApp confirming ticket number.
 * WasenderAPI payload: { event, session, data: { from, body, type, mediaUrl?, mimeType? } }
 * Security: validated against WASENDER_WEBHOOK_SECRET header.
 * Media: downloads AES-256-CBC encrypted CDN files, decrypts with HKDF key derivation, compresses
 * images with sharp (max 1280px JPEG 85%), compresses videos with ffmpeg (H.264 CRF 28 max 720p).
 */
import { NextRequest, NextResponse, after } from 'next/server';
import { hkdfSync, createDecipheriv } from 'crypto';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFile, readFile, unlink } from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import sharp from 'sharp';
import { supabaseAdmin } from '@/backend/lib/supabase/admin';
import { resolveClassification, logClassification } from '@/backend/lib/ticketing';
import { classifyTicketEnhanced } from '@/backend/lib/ticketing/classifyTicket';
import { WhatsAppService } from '@/backend/services/WhatsAppService';

const BUCKET_NAME = 'ticket_photos';

// Validate webhook secret to ensure requests come from WasenderAPI
const WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET;

function extractFloorNumber(text: string): number | null {
    const lower = text.toLowerCase();
    if (lower.includes('ground floor') || lower.includes('floor 0') || lower.includes('level 0')) return 0;
    if (lower.includes('basement') || lower.includes('b1')) return -1;
    const patterns = [
        /(\d+)(?:st|nd|rd|th)\s*floor/i,
        /floor\s*(\d+)/i,
        /level\s*(\d+)/i,
    ];
    for (const p of patterns) {
        const m = text.match(p);
        if (m) return parseInt(m[1], 10);
    }
    return null;
}

function extractLocation(text: string): string | null {
    const locations: Record<string, string[]> = {
        'Cafeteria': ['cafeteria', 'canteen', 'pantry', 'kitchen'],
        'Reception': ['lobby', 'reception', 'entrance'],
        'Parking': ['parking', 'basement', 'garage'],
        'Washroom': ['washroom', 'restroom', 'toilet', 'bathroom'],
        'Conference Room': ['conference', 'meeting room'],
        'Server Room': ['server room', 'data center'],
    };
    const lower = text.toLowerCase();
    for (const [loc, keywords] of Object.entries(locations)) {
        for (const kw of keywords) {
            if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) return loc;
        }
    }
    return null;
}

/**
 * Decrypt WhatsApp CDN media (AES-256-CBC).
 * Key derivation: HKDF-SHA256(mediaKey, salt=32zeros, info="WhatsApp <Type> Keys") → 112 bytes
 * IV = bytes 0–15, CipherKey = bytes 16–47, file = encryptedData[0..-10] (strip 10-byte MAC)
 */
function decryptWhatsAppMedia(encryptedBuffer: Buffer, mediaKeyBase64: string, mediaType: 'image' | 'video' = 'image'): Buffer {
    const mediaKey = Buffer.from(mediaKeyBase64, 'base64');
    const salt = Buffer.alloc(32);
    const infoStr = mediaType === 'video' ? 'WhatsApp Video Keys' : 'WhatsApp Image Keys';
    const keyMaterial = Buffer.from(hkdfSync('sha256', mediaKey, salt, Buffer.from(infoStr), 112));
    const iv = keyMaterial.subarray(0, 16);
    const cipherKey = keyMaterial.subarray(16, 48);
    const encData = encryptedBuffer.subarray(0, -10);
    const decipher = createDecipheriv('aes-256-cbc', cipherKey, iv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(encData), decipher.final()]);
}

async function uploadMediaToStorage(mediaUrl: string, ticketId: string, mediaKeyBase64?: string): Promise<string | null> {
    try {
        // Download encrypted media from WhatsApp CDN
        const res = await fetch(mediaUrl);
        if (!res.ok) {
            console.error('[WA WEBHOOK] Failed to download media:', res.status);
            return null;
        }

        const encryptedBuffer = Buffer.from(await res.arrayBuffer());
        console.log('[WA WEBHOOK] Downloaded encrypted size:', encryptedBuffer.length, 'bytes');

        // Decrypt if we have the mediaKey (WhatsApp CDN files are AES-256-CBC encrypted)
        let rawBuffer: Buffer;
        if (mediaKeyBase64) {
            rawBuffer = decryptWhatsAppMedia(encryptedBuffer, mediaKeyBase64);
            console.log('[WA WEBHOOK] Decrypted size:', rawBuffer.length, 'bytes');
        } else {
            rawBuffer = encryptedBuffer;
        }

        // Compress with sharp: resize to max 1280px, convert to JPEG at 85% quality
        const compressed = await sharp(rawBuffer)
            .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85, progressive: true })
            .toBuffer();

        console.log('[WA WEBHOOK] Compressed size:', compressed.length, 'bytes');

        const fileName = `${ticketId}/before_${Date.now()}.jpg`;
        const { error } = await supabaseAdmin.storage
            .from(BUCKET_NAME)
            .upload(fileName, compressed, { contentType: 'image/jpeg', upsert: true });

        if (error) {
            console.error('[WA WEBHOOK] Storage upload failed:', error.message);
            return null;
        }

        const { data: { publicUrl } } = supabaseAdmin.storage.from(BUCKET_NAME).getPublicUrl(fileName);
        console.log('[WA WEBHOOK] Photo stored at:', publicUrl);
        return publicUrl;
    } catch (err) {
        console.error('[WA WEBHOOK] Media upload error:', err);
        return null;
    }
}

const VIDEO_BUCKET = 'ticket_videos';

/**
 * Compress video with ffmpeg — H.264, CRF 28, max 720p, AAC 64k, faststart for web.
 * Uses temp files (ffmpeg requires filesystem paths, not in-memory buffers).
 */
async function compressVideo(inputBuffer: Buffer): Promise<Buffer> {
    const id = `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const inputPath = join(tmpdir(), `${id}_in.mp4`);
    const outputPath = join(tmpdir(), `${id}_out.mp4`);
    await writeFile(inputPath, inputBuffer);
    try {
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    '-crf 28',
                    '-preset fast',
                    '-vf scale=\'trunc(min(1280\\,iw)/2)*2\':\'trunc(min(720\\,ih)/2)*2\'',
                    '-movflags +faststart',
                    '-b:a 64k',
                ])
                .on('end', () => resolve())
                .on('error', (err: Error) => reject(err))
                .save(outputPath);
        });
        return await readFile(outputPath);
    } finally {
        await Promise.all([unlink(inputPath), unlink(outputPath)]).catch(() => {});
    }
}

/** Download a WhatsApp CDN URL with retries (ECONNRESET is common on first attempt) */
async function fetchWithRetry(url: string, retries = 3): Promise<Response> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0',
                    'Accept': '*/*',
                },
            });
            if (res.ok) return res;
            console.warn(`[WA WEBHOOK] Fetch attempt ${i + 1} failed: HTTP ${res.status}`);
        } catch (err) {
            console.warn(`[WA WEBHOOK] Fetch attempt ${i + 1} error:`, (err as Error).message);
            if (i < retries - 1) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
    throw new Error('All fetch attempts failed');
}

/**
 * Download, decrypt, and store a WhatsApp video to the ticket_videos bucket.
 * Mirrors exactly how the app's POST /api/tickets/[id]/videos route works:
 * - Bucket: ticket_videos
 * - Path: {ticketId}/before_{timestamp}.{ext}
 * - DB field: video_before_url
 * - No backend compression (same as the app — videos stored as-is)
 */
async function uploadVideoToStorage(videoUrl: string, ticketId: string, mediaKeyBase64?: string): Promise<string | null> {
    try {
        const res = await fetchWithRetry(videoUrl);
        const encryptedBuffer = Buffer.from(await res.arrayBuffer());
        console.log('[WA WEBHOOK] Video downloaded size:', encryptedBuffer.length, 'bytes');

        let videoBuffer: Buffer;
        if (mediaKeyBase64) {
            videoBuffer = decryptWhatsAppMedia(encryptedBuffer, mediaKeyBase64, 'video');
            console.log('[WA WEBHOOK] Video decrypted size:', videoBuffer.length, 'bytes');
        } else {
            videoBuffer = encryptedBuffer;
        }

        // Compress before storing — H.264 CRF 28, max 720p, AAC 64k
        const compressed = await compressVideo(videoBuffer);
        console.log('[WA WEBHOOK] Video compressed size:', compressed.length, 'bytes');

        const fileName = `${ticketId}/before_${Date.now()}.mp4`;
        const { error } = await supabaseAdmin.storage
            .from(VIDEO_BUCKET)
            .upload(fileName, compressed, { contentType: 'video/mp4', upsert: true });

        if (error) {
            console.error('[WA WEBHOOK] Video storage upload failed:', error.message);
            return null;
        }

        const { data: { publicUrl } } = supabaseAdmin.storage.from(VIDEO_BUCKET).getPublicUrl(fileName);
        console.log('[WA WEBHOOK] Video stored at:', publicUrl);
        return publicUrl;
    } catch (err) {
        console.error('[WA WEBHOOK] Video upload error:', err);
        return null;
    }
}

/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp messages from WasenderAPI.
 * When a user sends a message (+ optional photo), creates a ticket automatically:
 *   1. Identify user by phone number
 *   2. Run Groq classification on message text
 *   3. Upload photo to Supabase storage (if any)
 *   4. Create ticket with photo_before_url
 *   5. Trigger notifications
 *   6. Reply to user on WhatsApp confirming the ticket
 *
 * WasenderAPI webhook payload shape (verify in dashboard):
 * {
 *   event: "message",
 *   session: string,
 *   data: {
 *     from: "919876543210@s.whatsapp.net",
 *     body: string,          // message text
 *     type: "text" | "image" | "video" | "document",
 *     mediaUrl?: string,     // present when type != "text"
 *     mimeType?: string,
 *     isGroup: boolean,
 *   }
 * }
 */
const SESSION_TTL_MINUTES = 10;

async function processIncomingMessage(
    senderPhone: string,
    messageText: string,
    mediaUrl: string | null,
    mediaKey: string | null,
    isImage: boolean,
    videoUrl: string | null = null,
    videoKey: string | null = null,
    isVideo = false,
    forcedPropertyId: string | null = null,
    waMessageId: string | null = null,
) {
    try {
        const mediaType = isImage ? 'image' : isVideo ? 'video' : 'text';
        console.log('[WA WEBHOOK] Processing | From:', senderPhone, '| Type:', mediaType, '| Text:', messageText);

        // ── Look up user by phone ─────────────────────────────────────────────
        const last10 = senderPhone.slice(-10);
        const { data: usersFound } = await supabaseAdmin
            .from('users')
            .select('id, full_name, phone')
            .or(`phone.eq.${last10},phone.ilike.%${last10}`)
            .limit(1);
        const userRow = usersFound?.[0] || null;

        if (!userRow) {
            console.warn('[WA WEBHOOK] No user found for phone:', senderPhone);
            WhatsAppService.send(senderPhone, {
                message: `❌ Your number is not registered in our system. Please contact your property manager.`,
            });
            return;
        }

        // ── Resolve all properties available to this user ────────────────────
        type PropOption = { id: string; name: string; organization_id: string };
        let propertyOptions: PropOption[] = [];

        // Fetch org admin record and properties in parallel
        const { data: orgAdminRecord } = await supabaseAdmin
            .from('organization_memberships')
            .select('organization_id')
            .eq('user_id', userRow.id)
            .eq('role', 'org_super_admin')
            .maybeSingle();

        if (orgAdminRecord) {
            const { data: allProps } = await supabaseAdmin
                .from('properties')
                .select('id, name, organization_id')
                .eq('organization_id', orgAdminRecord.organization_id)
                .limit(12);
            propertyOptions = (allProps || []).map(p => ({
                id: p.id, name: p.name, organization_id: p.organization_id,
            }));
            console.log('[WA WEBHOOK] org_super_admin detected — showing all', propertyOptions.length, 'org properties');
        } else {
            // Regular user: only their assigned properties
            const { data: memberships } = await supabaseAdmin
                .from('property_memberships')
                .select('property_id, properties(id, name, organization_id)')
                .eq('user_id', userRow.id)
                .limit(12);
            propertyOptions = (memberships || []).map((m: any) => ({
                id: m.property_id,
                name: m.properties?.name || m.property_id,
                organization_id: m.properties?.organization_id,
            }));
        }

        if (propertyOptions.length === 0) {
            console.warn('[WA WEBHOOK] User has no accessible properties:', userRow.id);
            WhatsAppService.send(senderPhone, {
                message: `❌ You are not assigned to any property. Please contact your property manager.`,
            });
            return;
        }

        // ── Multi-property: send a poll to let the user choose ────────────────
        if (!forcedPropertyId && propertyOptions.length > 1) {
            const expiresAt = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000).toISOString();

            // MUST await session save before sending poll — prevents race condition
            // where user taps poll before session is written to DB
            const { error: sessionError } = await supabaseAdmin.from('whatsapp_sessions').upsert({
                phone: senderPhone,
                state: 'awaiting_property',
                user_id: userRow.id,
                pending_text: messageText,
                pending_media_url: mediaUrl,
                pending_media_key: mediaKey,
                pending_video_url: videoUrl,
                pending_video_key: videoKey,
                pending_is_image: isImage,
                pending_is_video: isVideo,
                property_options: propertyOptions,
                expires_at: expiresAt,
            }, { onConflict: 'phone' });

            if (sessionError) {
                console.error('[WA WEBHOOK] Session upsert failed:', sessionError.message);
                WhatsAppService.send(senderPhone, {
                    message: `❌ Could not start property selection. Please try again.`,
                });
                return;
            }

            const pollSent = await WhatsAppService.sendPoll(
                senderPhone,
                '🏢 Which property is this request for?',
                propertyOptions.map(p => p.name),
            );
            if (!pollSent) {
                console.error('[WA WEBHOOK] sendPoll failed for:', senderPhone);
                WhatsAppService.send(senderPhone, { message: `❌ Could not send property selection. Please try again.` });
            }
            return;
        }

        // ── Single or pre-selected property ──────────────────────────────────
        let selectedProp = forcedPropertyId
            ? propertyOptions.find(p => p.id === forcedPropertyId)
            : propertyOptions[0];

        // Fallback: direct DB lookup (covers edge cases)
        if (!selectedProp && forcedPropertyId) {
            const { data: directProp } = await supabaseAdmin
                .from('properties')
                .select('id, name, organization_id')
                .eq('id', forcedPropertyId)
                .single();
            if (directProp) selectedProp = { id: directProp.id, name: directProp.name, organization_id: directProp.organization_id };
        }

        if (!selectedProp) {
            console.error('[WA WEBHOOK] Could not resolve property');
            WhatsAppService.send(senderPhone, {
                message: `❌ Could not identify your property. Please contact your property manager.`,
            });
            return;
        }

        const propertyId: string = selectedProp.id;
        const organizationId: string = selectedProp.organization_id;
        const propertyName: string = selectedProp.name || 'your property';

        if (!organizationId) {
            console.error('[WA WEBHOOK] Property has no organization_id:', propertyId);
            WhatsAppService.send(senderPhone, {
                message: `❌ Property configuration error. Please contact your administrator.`,
            });
            return;
        }

        // ── Run Groq classification ───────────────────────────────────────────
        const ticketText = messageText || 'Maintenance request via WhatsApp';

        // Step 1: Quick rule-based pre-pass to get issue_code + DB priority BEFORE Groq runs
        const preClassification = classifyTicketEnhanced(ticketText);
        let categoryId: string | null = null;
        let skillGroupId: string | null = null;
        let priority = 'medium';
        let slaHours = 24;

        if (preClassification.issue_code) {
            const { data: catData } = await supabaseAdmin
                .from('issue_categories')
                .select('id, skill_group_id, priority, sla_hours')
                .eq('code', preClassification.issue_code)
                .limit(1)
                .maybeSingle();
            if (catData) {
                categoryId = catData.id;
                skillGroupId = catData.skill_group_id;
                priority = catData.priority || 'medium';
                slaHours = catData.sla_hours || 24;
            }
        }

        // Step 2: Full classification with Groq — pass DB priority so Groq uses it as anchor
        const resolution = await resolveClassification(ticketText, priority);
        const { issue_code, skill_group, confidence, decisionSource } = resolution;
        const isVague = confidence === 'low';

        // Step 3: If Groq resolved a different issue_code, re-fetch category/skill group IDs
        if (issue_code && issue_code !== preClassification.issue_code) {
            const { data: catData } = await supabaseAdmin
                .from('issue_categories')
                .select('id, skill_group_id, priority, sla_hours')
                .eq('code', issue_code)
                .limit(1)
                .maybeSingle();
            if (catData) {
                categoryId = catData.id;
                skillGroupId = catData.skill_group_id;
                // Only update priority if Groq's category has higher priority
                const priorityRank: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
                if ((priorityRank[catData.priority] ?? 0) > (priorityRank[priority] ?? 0)) {
                    priority = catData.priority;
                }
                slaHours = catData.sla_hours || slaHours;
            }
        }

        if (!skillGroupId) {
            const { data: defaultSkill } = await supabaseAdmin
                .from('skill_groups')
                .select('id')
                .eq('code', skill_group)
                .limit(1)
                .maybeSingle();
            if (defaultSkill) skillGroupId = defaultSkill.id;
        }

        // ── Create ticket ─────────────────────────────────────────────────────
        const ticketNumber = `TKT-${Date.now()}`;
        // Groq can escalate priority but never downgrade below the DB category default
        const priorityRank: Record<string, number> = { low: 0, medium: 1, high: 2, urgent: 3 };
        const groqPriority = resolution.priority?.toLowerCase() || '';
        const dbPriority = priority; // from issue_categories table
        const finalPriority = (priorityRank[groqPriority] ?? -1) > (priorityRank[dbPriority] ?? -1)
            ? groqPriority
            : dbPriority;
        const titleText = ticketText.slice(0, 100);

        const { data: ticket, error: insertError } = await supabaseAdmin
            .from('tickets')
            .insert({
                ticket_number: ticketNumber,
                property_id: propertyId,
                organization_id: organizationId,
                title: titleText,
                description: ticketText,
                category: issue_code,
                category_id: categoryId,
                skill_group_id: skillGroupId,
                department: skill_group,
                priority: finalPriority,
                status: 'waitlist',
                raised_by: userRow.id,
                raised_by_name: userRow.full_name || null,
                internal: false,
                is_vague: isVague,
                sla_hours: slaHours,
                floor_number: extractFloorNumber(ticketText) ?? undefined,
                location: extractLocation(ticketText) ?? undefined,
                issue_code,
                skill_group_code: skill_group,
                confidence,
                secondary_category_code: resolution.secondary_category_code,
                risk_flag: resolution.risk_flag,
                llm_reasoning: resolution.llm_reasoning,
                classification_source: decisionSource,
                confidence_score: resolution.llmResult ? 90 : 100,
                wa_message_id: waMessageId,
            })
            .select('*')
            .single();

        if (insertError || !ticket) {
            console.error('[WA WEBHOOK] Ticket insert error:', insertError?.message);
            WhatsAppService.send(senderPhone, {
                message: `❌ Failed to create your request. Please try again or contact the front desk.`,
            });
            return;
        }

        // ── Upload + compress photo if present ────────────────────────────────
        let photoUrl: string | null = null;
        if (mediaUrl && isImage) {
            photoUrl = await uploadMediaToStorage(mediaUrl, ticket.id, mediaKey ?? undefined);
            if (photoUrl) {
                await supabaseAdmin
                    .from('tickets')
                    .update({ photo_before_url: photoUrl })
                    .eq('id', ticket.id);
                console.log('[WA WEBHOOK] Photo saved:', photoUrl);
            }
        }

        // ── Upload video if present ───────────────────────────────────────────
        let storedVideoUrl: string | null = null;
        if (videoUrl && isVideo) {
            storedVideoUrl = await uploadVideoToStorage(videoUrl, ticket.id, videoKey ?? undefined);
            if (storedVideoUrl) {
                await supabaseAdmin
                    .from('tickets')
                    .update({ video_before_url: storedVideoUrl })
                    .eq('id', ticket.id);
                console.log('[WA WEBHOOK] Video saved:', storedVideoUrl);
            }
        }

        // ── Attach escalation hierarchy ───────────────────────────────────────
        let { data: defaultHierarchy } = await supabaseAdmin
            .from('escalation_hierarchies')
            .select('id')
            .eq('organization_id', organizationId)
            .eq('property_id', propertyId)
            .eq('is_default', true)
            .eq('is_active', true)
            .maybeSingle();

        if (!defaultHierarchy) {
            const { data: orgWide } = await supabaseAdmin
                .from('escalation_hierarchies')
                .select('id')
                .eq('organization_id', organizationId)
                .is('property_id', null)
                .eq('is_default', true)
                .eq('is_active', true)
                .maybeSingle();
            defaultHierarchy = orgWide;
        }

        if (defaultHierarchy) {
            await supabaseAdmin
                .from('tickets')
                .update({
                    hierarchy_id: defaultHierarchy.id,
                    current_escalation_level: 0,
                    escalation_last_action_at: new Date().toISOString(),
                })
                .eq('id', ticket.id);
        }

        // ── Log classification ────────────────────────────────────────────────
        logClassification(ticket.id, resolution).catch(err => {
            console.error('[WA WEBHOOK] Classification log error:', err);
        });

        // ── Trigger push notifications ────────────────────────────────────────
        try {
            const { NotificationService } = await import('@/backend/services/NotificationService');
            await NotificationService.afterTicketCreated(ticket.id);
            if (finalPriority === 'critical') {
                await NotificationService.afterCriticalTicketCreated(ticket.id);
            }
        } catch (err) {
            console.error('[WA WEBHOOK] NotificationService import error:', err);
        }

        // ── Reply on WhatsApp ─────────────────────────────────────────────────
        const priorityEmoji: Record<string, string> = {
            critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
        };
        const pEmoji = priorityEmoji[finalPriority] || '⚪';
        const categoryLabel = issue_code?.replace(/_/g, ' ') || skill_group?.replace(/_/g, ' ') || 'General';

        const replyMessage = [
            `✅ *Request Created Successfully!*`,
            ``,
            `🎫 *${ticketNumber}*`,
            `📋 ${titleText}`,
            `🏢 ${propertyName}`,
            `🔧 Category: *${categoryLabel.toUpperCase()}*`,
            `${pEmoji} Priority: *${finalPriority.toUpperCase()}*`,
            photoUrl ? `📷 Photo attached` : '',
            storedVideoUrl ? `🎥 Video attached` : '',
            ``,
            `Our team will look into it shortly.`,
        ].filter(Boolean).join('\n');

        WhatsAppService.send(senderPhone, {
            message: replyMessage,
            deepLink: `/tickets/${ticket.id}?from=requests`,
        });

        console.log('[WA WEBHOOK] ✅ Ticket created:', ticket.id, '| Ticket#:', ticketNumber);
    } catch (err: any) {
        const fs = require('fs');
        fs.appendFileSync('tmp_wa_error.log', `[${new Date().toISOString()}] Error: ${err.stack}\n`);
        console.error('[WA WEBHOOK] processIncomingMessage error:', err);
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!WEBHOOK_SECRET) {
            console.error('[WA WEBHOOK] WASENDER_WEBHOOK_SECRET is not set');
            return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
        }
        const sig = request.headers.get('x-webhook-signature') || request.headers.get('x-wasender-secret');
        if (sig !== WEBHOOK_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        console.log('[WA WEBHOOK] Received:', JSON.stringify(body).slice(0, 800));

        const event = body.event || body.type;
        const msgData = body.data || body;

        // ── Poll result: user selected a property ─────────────────────────────
        if (event === 'poll.results') {
            const pollData = (msgData.key || msgData.pollResult) ? msgData : (msgData.data || msgData);
            const pollResult: Array<{ name: string; voters: string[] }> = pollData.pollResult || [];
            const selectedOption = pollResult.find(r => r.voters && r.voters.length > 0);

            if (!selectedOption) return NextResponse.json({ ok: true });

            const rawVoterJid: string = selectedOption.voters[0] || '';
            const voterPhone = rawVoterJid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
            const last10 = voterPhone.slice(-10);

            if (!last10) return NextResponse.json({ ok: true });

            const { data: session } = await supabaseAdmin
                .from('whatsapp_sessions')
                .select('*')
                .ilike('phone', `%${last10}`)
                .eq('state', 'awaiting_property')
                .gt('expires_at', new Date().toISOString())
                .maybeSingle();

            if (!session) {
                if (voterPhone) {
                    WhatsAppService.send(voterPhone, {
                        message: `⏰ Your property selection expired. Please send your request again.`,
                    });
                }
                return NextResponse.json({ ok: true });
            }

            const propertyOptions: Array<{ id: string; name: string }> = session.property_options || [];
            const selectedProperty = propertyOptions.find(p => p.name.trim().toLowerCase() === selectedOption.name.trim().toLowerCase());

            if (!selectedProperty) {
                WhatsAppService.send(session.phone, {
                    message: `❌ Property selection failed. Please send your request again.`,
                });
                return NextResponse.json({ ok: true });
            }

            await supabaseAdmin.from('whatsapp_sessions').delete().ilike('phone', `%${last10}`);

            after(
                processIncomingMessage(
                    session.phone,
                    session.pending_text || '',
                    session.pending_media_url,
                    session.pending_media_key,
                    session.pending_is_image,
                    session.pending_video_url,
                    session.pending_video_key,
                    session.pending_is_video,
                    selectedProperty.id,
                ).catch(err => console.error('[WA WEBHOOK] [POLL] Post-poll processing error:', err))
            );

            return NextResponse.json({ ok: true });
        }

        if (event !== 'messages.received') {
            return NextResponse.json({ ok: true });
        }

        const msg = msgData.messages || msgData;
        const msgKey = msg.key || {};
        const msgContent = msg.message || {};
        const msgId = msgKey.id;

        // Ignore group messages and outgoing messages
        const remoteJid: string = msgKey.remoteJid || msgData.from || '';
        if (remoteJid.includes('@g.us') || msgKey.fromMe === true) {
            return NextResponse.json({ ok: true });
        }

        if (msgId) {
            const { data: existingTicket } = await supabaseAdmin
                .from('tickets')
                .select('id')
                .eq('wa_message_id', msgId)
                .maybeSingle();

            if (existingTicket) {
                console.log('[WA WEBHOOK] Duplicate detected, ignoring:', msgId);
                return NextResponse.json({ ok: true });
            }
        }

        const senderPn: string = msgKey.cleanedSenderPn || msgKey.senderPn || msgData.from || '';
        const senderPhone = senderPn.replace('@s.whatsapp.net', '').replace(/\D/g, '');

        if (!senderPhone || senderPhone.length < 10) return NextResponse.json({ ok: true });

        const imageMsg = msgContent.imageMessage;
        const videoMsg = msgContent.videoMessage;
        const textMsg = msgContent.conversation || msgContent.extendedTextMessage?.text || '';
        const messageText: string = imageMsg?.caption || videoMsg?.caption || textMsg || '';
        const mediaUrl: string | null = imageMsg?.url || null;
        const mediaKey: string | null = imageMsg?.mediaKey || null;
        const videoUrl: string | null = videoMsg?.url || null;
        const videoKey: string | null = videoMsg?.mediaKey || null;
        const isImage = !!imageMsg;
        const isVideo = !!videoMsg;

        if (!messageText && !mediaUrl && !videoUrl) return NextResponse.json({ ok: true });

        await processIncomingMessage(
            senderPhone, 
            messageText, 
            mediaUrl, 
            mediaKey, 
            isImage, 
            videoUrl, 
            videoKey, 
            isVideo,
            null, 
            msgId
        );

        return NextResponse.json({ ok: true });

    } catch (err) {
        console.error('[WA WEBHOOK] Unhandled error:', err);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
