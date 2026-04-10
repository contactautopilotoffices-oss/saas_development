/**
 * SOP layout analysis API.
 * POST: Analyze floor layout for SOP placement.
 * Auth: Property Admin.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import Groq from 'groq-sdk';

/**
 * POST /api/properties/[propertyId]/sop/analyze-layout
 * Accepts a multipart/form-data with a floor plan image.
 * Sends to Groq vision model → returns suggested SOP templates per area.
 */
export async function POST(
    request: NextRequest,
    _context: { params: Promise<{ propertyId: string }> }
) {
    const supabase = await createClient();

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        const formData = await request.formData();
        const file = formData.get('image') as File | null;

        if (!file) {
            return NextResponse.json({ error: 'No image provided' }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or GIF images are supported' }, { status: 400 });
        }

        // Convert to base64
        const arrayBuffer = await file.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const imageUrl = `data:${file.type};base64,${base64}`;

        const apiKey = process.env.GROQ_LAYOUT_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Layout AI service not configured' }, { status: 503 });
        }
        const groq = new Groq({ apiKey });

        const completion = await groq.chat.completions.create({
            model: 'meta-llama/llama-4-scout-17b-16e-instruct',
            messages: [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'image_url',
                            image_url: { url: imageUrl },
                        },
                        {
                            type: 'text',
                            text: `You are a building facilities management expert. Analyze this building floor plan image and identify all distinct areas or rooms visible.

For each area you identify, suggest 1-3 relevant SOP (Standard Operating Procedure) checklist templates that maintenance or operations staff would typically need.

Return ONLY a valid JSON array with no markdown, no explanation, just the raw JSON. Format:
[
  {
    "area": "Area/Room Name",
    "floor": "Floor level or zone (e.g. Ground Floor, Level 1, Basement, Rooftop)",
    "category": "cleaning|maintenance|safety|security|inspection",
    "templates": [
      {
        "title": "Template Title",
        "description": "Brief description of what this checklist covers",
        "frequency": "every_1_hour|every_2_hours|every_3_hours|every_4_hours|every_6_hours|every_8_hours|every_12_hours|daily|weekly|monthly|on_demand",
        "items": [
          { "title": "Checklist item", "type": "checkbox" },
          { "title": "Another item", "type": "checkbox" }
        ]
      }
    ]
  }
]

Important rules:
- Include only areas clearly visible in the floor plan
- Suggest practical, realistic checklists for each area
- Items should be specific and actionable (3-8 items per template)
- Categories: cleaning, maintenance, safety, security, inspection
- For high-traffic or safety-critical areas (lobby, parking, gym, pool, corridors), prefer hourly frequencies like every_2_hours or every_3_hours
- Use daily/weekly/monthly for routine maintenance; on_demand for irregular tasks
- If the image is not a floor plan, return an empty array []`,
                        },
                    ],
                },
            ],
            max_tokens: 4096,
            temperature: 0.3,
        });

        const rawText = completion.choices[0]?.message?.content ?? '[]';

        // Extract JSON from response (handle cases where model wraps it)
        let suggestions: any[] = [];
        try {
            // Try direct parse first
            suggestions = JSON.parse(rawText);
        } catch {
            // Try extracting JSON array from text
            const match = rawText.match(/\[[\s\S]*\]/);
            if (match) {
                try {
                    suggestions = JSON.parse(match[0]);
                } catch {
                    suggestions = [];
                }
            }
        }

        if (!Array.isArray(suggestions)) suggestions = [];

        return NextResponse.json({
            success: true,
            suggestions,
            total: suggestions.length,
        });
    } catch (err: any) {
        console.error('[Layout Analyzer] Error:', err);
        return NextResponse.json(
            { error: err.message || 'Failed to analyze layout' },
            { status: 500 }
        );
    }
}
