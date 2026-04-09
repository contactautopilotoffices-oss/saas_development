/**
 * OCR meter reading API.
 * Extracts meter values from uploaded images using AI/OCR.
 * POST /api/ocr/meter
 * Auth: Supabase session.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

export async function POST(req: NextRequest) {
    try {
        const { imageUrl, meterId, propertyId } = await req.json();

        if (!imageUrl) {
            return NextResponse.json({ error: 'Image URL is required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log(`[OCR] Request for meter: ${meterId} property: ${propertyId}`);

        // 1. Log Start to Audit Table
        if (meterId && propertyId) {
            await supabase.from('ocr_audit_logs').insert({
                property_id: propertyId,
                event_type: 'process_start',
                payload: { meter_id: meterId, imageUrl }
            });
        }

        // 2. Prepare Groq Request
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: MODEL,
                messages: [
                    {
                        role: 'system',
                        content: `You are a specialized OCR tool for electricity meters. 
Your goal is to extract the cumulative numeric reading (kVAh or kWh) ONLY from the DIGITAL LCD DISPLAY.

CRITICAL INSTRUCTIONS:
1. IGNORE any handwritten labels, stickers, brown tape, or Sharpie marks on the meter casing.
2. ONLY extract digits from the backlit Digital LCD screen.
3. Electricity meters typically cycle through screens. If the screen shows "kW", "MD", "TIME", or "DATE", it is NOT the reading.
4. Locate the digits that correspond to "kVAh" or "kWh".
5. Return ONLY a valid JSON object: {"reading": number, "confidence": number, "unit": "kWh" | "kVAh" | "unknown", "is_blurry": boolean, "digits_found": string[]}
6. If the LCD is off or not showing digits, set confidence below 10%.`
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'text', text: "Extract the cumulative reading and the unit (kVAh vs kWh) specifically from the digital LCD screen in this photo." },
                            {
                                type: 'image_url',
                                image_url: {
                                    url: imageUrl
                                }
                            }
                        ]
                    }
                ],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[OCR API Error]:', errorText);
            throw new Error(`Groq API returned ${response.status}: ${errorText}`);
        }

        const data = await response.json();
        const content = JSON.parse(data.choices[0].message.content);

        console.log('[OCR Result]:', content);

        // 3. Log Success and Store Results (Shadow Entry)
        if (meterId && propertyId) {
            const readingDate = new Date().toISOString().split('T')[0];

            // 3.1 Fetch Meter Metadata (PF, latest reading for opening)
            const { data: meterData } = await supabase
                .from('electricity_meters')
                .select('default_power_factor, last_reading')
                .eq('id', meterId)
                .single();
            
            const pf = meterData?.default_power_factor || 0.95;
            const openingReading = meterData?.last_reading || 0;
            let finalReading = content.reading;
            let conversionApplied = false;

            // 3.2 Conversion Logic: if OCR found kWh but we need kVAh
            if (content.unit === 'kWh' && content.reading) {
                finalReading = Number((content.reading / pf).toFixed(2));
                conversionApplied = true;
            }

            // 3.3 Get Active Multiplier
            let multiplierId = null;
            let multiplierValue = 1;
            const { data: multData } = await supabase
                .rpc('get_active_multiplier', {
                    p_meter_id: meterId,
                    p_date: readingDate
                });

            if (multData && multData.length > 0) {
                multiplierId = multData[0].id;
                multiplierValue = multData[0].multiplier_value || 1;
            }

            // 3.4 Get Active Tariff
            let tariffId = null;
            let tariffRate = 0;
            const { data: tariffData } = await supabase
                .rpc('get_active_grid_tariff', {
                    p_property_id: propertyId,
                    p_date: readingDate
                });

            if (tariffData && tariffData.length > 0) {
                tariffId = tariffData[0].id;
                tariffRate = tariffData[0].rate_per_unit || 0;
            }

            // 3.5 Compute Units and Cost
            const rawUnits = (finalReading || 0) - openingReading;
            const finalUnits = rawUnits * multiplierValue;
            const computedCost = finalUnits * tariffRate;

            const { error: auditError } = await supabase.from('ocr_audit_logs').insert({
                property_id: propertyId,
                event_type: 'process_success',
                payload: { 
                    meter_id: meterId, 
                    content: { ...content, final_reading: finalReading, conversion_applied: conversionApplied, pf_used: pf }, 
                    photo_url: imageUrl,
                    usage: data.usage 
                }
            });

            if (auditError) {
                console.error('[OCR Audit Log Error]:', auditError);
            }

            // 3.6 Store/Update Reading (Safe Lookup-then-Update)
            // This is more robust than upsert if the unique constraint is missing or failing
            const { data: existingReading } = await supabase
                .from('electricity_readings')
                .select('id')
                .eq('meter_id', meterId)
                .eq('reading_date', readingDate)
                .maybeSingle();

            const readingData = {
                meter_id: meterId,
                property_id: propertyId,
                opening_reading: openingReading,
                closing_reading: finalReading || 0,
                ocr_reading: finalReading,
                ocr_confidence: content.confidence,
                ocr_unit_detected: content.unit,
                photo_url: imageUrl,
                ocr_status: 'pending',
                reading_date: readingDate,
                created_by: user.id,
                multiplier_id: multiplierId,
                multiplier_value_used: multiplierValue,
                tariff_id: tariffId,
                tariff_rate_used: tariffRate,
                final_units: finalUnits,
                computed_cost: computedCost,
                ocr_raw_response: { ...content, conversion_applied: conversionApplied, pf_used: pf }
            };

            let dbResult;
            if (existingReading) {
                console.log('[OCR] Updating existing reading:', existingReading.id);
                dbResult = await supabase
                    .from('electricity_readings')
                    .update(readingData)
                    .eq('id', existingReading.id);
            } else {
                console.log('[OCR] Creating new reading record');
                dbResult = await supabase
                    .from('electricity_readings')
                    .insert(readingData);
            }

            if (dbResult.error) {
                console.error('[OCR Storage Error]:', dbResult.error);
                throw new Error(`Database error: ${dbResult.error.message}`);
            }
            
            console.log('[OCR] Successfully stored reading for meter:', meterId);

            // Return augmented content to frontend
            content.reading = finalReading;
            content.conversion_applied = conversionApplied;
            content.pf_used = pf;
        }

        return NextResponse.json(content);

    } catch (error: any) {
        console.error('[OCR API] Internal Error:', error);
        return NextResponse.json({ 
            error: 'Failed to process OCR', 
            details: error.message 
        }, { status: 500 });
    }
}
