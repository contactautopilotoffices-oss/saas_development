/**
 * POST /api/tickets/bulk-import
 * Bulk snag/issue import from CSV or Excel for a property.
 * Two-phase: (1) validate-only mode returns preview with row-level errors,
 * (2) confirm mode inserts tickets and triggers intelligent round-robin assignment.
 * CSV columns expected: issue_description, issue_date (DD-MM-YYYY)
 * Auto-extracts: floor_number (regex patterns), location (keyword matching)
 * Classification: rule-based via classifyTicket() for issue_code, skill_group, confidence
 * Assignment: processIntelligentAssignment() round-robin for unassigned tickets
 * Body (FormData): file, propertyId, organizationId, confirmImport (true/false)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import { classifyTicket } from '@/backend/lib/ticketing';
import { processIntelligentAssignment } from '@/backend/lib/ticketing/assignment';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface SnagRow {
    issue_description: string;
    issue_date: string;
    // Computed fields
    skill_group?: string;
    issue_code?: string | null;
    confidence?: string;
    isValid?: boolean;
    validationErrors?: string[];
}

interface ParsedData {
    rows: SnagRow[];
    errors: string[];
}

/**
 * Parse DD-MM-YYYY date format to ISO date string
 */
function parseDateDDMMYYYY(dateStr: string): string | null {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;

    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10);

    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;

    // Return ISO format for database storage
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Extract floor number from description (reusing existing logic)
 */
function extractFloorNumber(description: string): number | null {
    const lowerDesc = description.toLowerCase();

    // Check for ground floor first (including common misspellings)
    if (lowerDesc.includes('ground floor') ||
        lowerDesc.includes('grourd floor') ||
        lowerDesc.includes('groud floor') ||
        lowerDesc.includes('floor 0') ||
        lowerDesc.includes('level 0')) {
        return 0;
    }

    // Check for basement
    if (lowerDesc.includes('basement') || lowerDesc.includes('b1')) return -1;
    if (lowerDesc.includes('b2')) return -2;

    const floorPatterns = [
        /(\d+)(?:st|nd|rd|th)\s*floor/i,
        /floor\s*(\d+)/i,
        /(\d+)\s*floor/i,
        /level\s*(\d+)/i,
    ];

    for (const pattern of floorPatterns) {
        const match = description.match(pattern);
        if (match) return parseInt(match[1], 10);
    }
    return null;
}

/**
 * Extract location from description (reusing existing logic)
 */
function extractLocation(description: string): string | null {
    const locations: Record<string, string[]> = {
        'Cafeteria': ['cafeteria', 'canteen', 'pantry', 'kitchen', 'mess'],
        'Reception': ['lobby', 'reception', 'front desk', 'entrance'],
        'Parking': ['parking', 'basement', 'garage'],
        'Terrace': ['terrace', 'roof', 'rooftop'],
        'Washroom': ['washroom', 'restroom', 'toilet', 'bathroom', 'loo'],
        'Conference Room': ['conference', 'meeting room', 'board room'],
        'Cabin': ['cabin', 'cubicle', 'desk', 'workstation'],
        'Server Room': ['server room', 'data center', 'hub room'],
        'Electrical Room': ['electrical room', 'ups room', 'dg room']
    };

    const lowerDesc = description.toLowerCase();
    for (const [loc, keywords] of Object.entries(locations)) {
        for (const keyword of keywords) {
            // Use word boundaries to avoid matching keywords inside other words (e.g., 'loo' in 'floor')
            const regex = new RegExp(`\\b${keyword}\\b`, 'i');
            if (regex.test(lowerDesc)) return loc;
        }
    }
    return null;
}

/**
 * Parse CSV content
 */
function parseCSV(content: string): ParsedData {
    const result = Papa.parse<Record<string, string>>(content, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.toLowerCase().trim().replace(/\s+/g, '_'),
    });

    const rows: SnagRow[] = [];
    const errors: string[] = [];

    result.data.forEach((row, index) => {
        const rowNum = index + 2; // +2 because header is row 1 and index is 0-based
        const validationErrors: string[] = [];

        // Validate required fields
        const issueDescription = row.issue_description?.trim();
        const issueDate = row.issue_date?.trim();

        if (!issueDescription) {
            validationErrors.push('Missing issue_description');
        }
        if (!issueDate) {
            validationErrors.push('Missing issue_date');
        } else if (!parseDateDDMMYYYY(issueDate)) {
            validationErrors.push('Invalid date format (expected DD-MM-YYYY)');
        }

        // Classify the ticket
        let classification = { issue_code: null as string | null, skill_group: 'technical', confidence: 'low' };
        if (issueDescription) {
            classification = classifyTicket(issueDescription);
        }

        rows.push({
            issue_description: issueDescription || '',
            issue_date: issueDate || '',
            skill_group: classification.skill_group,
            issue_code: classification.issue_code,
            confidence: classification.confidence,
            isValid: validationErrors.length === 0,
            validationErrors,
        });

        if (validationErrors.length > 0) {
            errors.push(`Row ${rowNum}: ${validationErrors.join(', ')}`);
        }
    });

    return { rows, errors };
}

/**
 * Parse Excel content
 */
function parseExcel(buffer: ArrayBuffer): ParsedData {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convert to CSV and use existing CSV parser
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return parseCSV(csv);
}

/**
 * POST /api/tickets/bulk-import
 * Preview and import bulk snags from CSV/Excel
 */
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const propertyId = formData.get('propertyId') as string;
        const organizationId = formData.get('organizationId') as string;
        const confirmImport = formData.get('confirmImport') === 'true';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (!propertyId || !organizationId) {
            return NextResponse.json({ error: 'Missing propertyId or organizationId' }, { status: 400 });
        }

        // Determine file type and parse
        const fileName = file.name.toLowerCase();
        let parsedData: ParsedData;

        if (fileName.endsWith('.csv')) {
            const content = await file.text();
            parsedData = parseCSV(content);
        } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
            const buffer = await file.arrayBuffer();
            parsedData = parseExcel(buffer);
        } else {
            return NextResponse.json({ error: 'Unsupported file type. Use CSV or Excel.' }, { status: 400 });
        }

        const { rows, errors } = parsedData;
        const validRows = rows.filter(r => r.isValid);
        const invalidRows = rows.filter(r => !r.isValid);

        // If not confirming import, return preview data
        if (!confirmImport) {
            return NextResponse.json({
                preview: true,
                totalRows: rows.length,
                validRows: validRows.length,
                invalidRows: invalidRows.length,
                rows: rows,
                errors: errors,
            });
        }

        // Confirm import - create snag_import record and insert tickets
        if (validRows.length === 0) {
            return NextResponse.json({ error: 'No valid rows to import' }, { status: 400 });
        }

        // Create import batch record (optional - skip if table doesn't exist)
        let importBatchId: string | null = null;

        try {
            const { data: importBatch, error: batchError } = await supabase
                .from('snag_imports')
                .insert({
                    property_id: propertyId,
                    organization_id: organizationId,
                    imported_by: user.id,
                    filename: file.name,
                    total_rows: rows.length,
                    valid_rows: validRows.length,
                    error_rows: invalidRows.length,
                    status: 'processing',
                })
                .select('id')
                .single();

            if (batchError) {
                console.warn('Warning: Could not create import batch (table may not exist or RLS blocked):', batchError.message);
                // Continue without batch tracking
            } else {
                importBatchId = importBatch.id;
            }
        } catch (err) {
            console.warn('Warning: snag_imports table error:', err);
            // Continue without batch tracking
        }

        // Resolve all categories and skill groups for lookup
        const { data: allCategories } = await supabase
            .from('issue_categories')
            .select('id, code, skill_group_id, priority, sla_hours');

        const { data: allSkillGroups } = await supabase
            .from('skill_groups')
            .select('id, code');

        const categoryMap = new Map(allCategories?.map(c => [c.code, c]) || []);
        const skillGroupMap = new Map(allSkillGroups?.map(sg => [sg.code, sg.id]) || []);

        // Prepare tickets for insert
        const ticketsToInsert = validRows.map((row, index) => {
            // 1. Rule-based Classification
            const classification = classifyTicket(row.issue_description);
            const { issue_code, skill_group, confidence } = classification;

            // 2. Resolve IDs
            const cat = issue_code ? categoryMap.get(issue_code) : null;
            const skillGroupId = cat?.skill_group_id || skillGroupMap.get(skill_group);

            // 3. Extract Floor and Location
            const floorNumber = extractFloorNumber(row.issue_description);
            const location = extractLocation(row.issue_description);

            // 4. Generate unique ticket number
            const ticketNumber = `TKT-${Date.now()}-${index}-${Math.random().toString(36).substring(2, 7)}`.toUpperCase();

            return {
                property_id: propertyId,
                organization_id: organizationId,
                ticket_number: ticketNumber,
                title: row.issue_description.slice(0, 100),
                description: row.issue_description,
                category: issue_code || 'general',
                category_id: cat?.id || null,
                skill_group_id: skillGroupId || null,
                priority: cat?.priority || 'medium',
                status: 'open', // Trigger will auto-assign if possible
                raised_by: user.id,
                import_batch_id: importBatchId,
                issue_code: issue_code,
                skill_group_code: skill_group,
                confidence: confidence,
                sla_hours: cat?.sla_hours || 24,
                floor_number: floorNumber,
                location: location,
                is_internal: false
            };
        });

        // Insert tickets
        const { data: insertedTickets, error: insertError } = await supabase
            .from('tickets')
            .insert(ticketsToInsert)
            .select('id, status, title');

        if (insertError) {
            // Mark import as failed (if batch was created)
            if (importBatchId) {
                await supabase
                    .from('snag_imports')
                    .update({ status: 'failed' })
                    .eq('id', importBatchId);
            }

            console.error('Error inserting tickets:', insertError);
            return NextResponse.json({ error: 'Failed to insert tickets', details: insertError.message }, { status: 500 });
        }

        // Mark import as completed (if batch was created)
        if (importBatchId) {
            await supabase
                .from('snag_imports')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', importBatchId);
        }

        // 5. Automatic Assignment (Rule-base + Round Robin)
        // Fetch the full ticket data including skill_group_code for the assignment engine
        const { data: ticketsToAssign } = await supabase
            .from('tickets')
            .select('id, property_id, skill_group_code, status')
            .in('id', insertedTickets.map(t => t.id))
            .in('status', ['open', 'waitlist']); // Only assign those not already assigned by DB triggers

        let assignmentSummary = null;
        if (ticketsToAssign && ticketsToAssign.length > 0) {
            const assignmentResult = await processIntelligentAssignment(supabase, ticketsToAssign, propertyId);
            assignmentSummary = assignmentResult.summary;
        }

        return NextResponse.json({
            success: true,
            importBatchId: importBatchId,
            ticketsCreated: insertedTickets?.length || 0,
            assignmentSummary,
            tickets: insertedTickets,
        }, { status: 201 });

    } catch (error) {
        console.error('Bulk import API error:', error);
        return NextResponse.json({
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
}
