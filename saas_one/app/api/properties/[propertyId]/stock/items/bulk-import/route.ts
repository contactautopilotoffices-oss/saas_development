/**
 * POST /api/properties/[propertyId]/stock/items/bulk-import
 * Bulk import stock items from CSV data for a property.
 * Two modes: 'validate' returns preview with row-level errors (no DB writes);
 * 'import' (default) inserts items, generates barcodes (CODE128), and creates initial stock movements.
 * CSV columns: item_name/name, item_code, category, unit, current_stock/quantity, min_threshold, location, description, per_unit_cost
 * Validates: required name, non-negative stock/cost, no duplicate item_codes within CSV or DB.
 * Auto-generates: barcode (format: {PROP_CODE}-{ITEM_CODE}-{timestamp}), qr_code_data JSON
 * On import: creates stock_movements for all items with quantity > 0 (action: 'initial').
 * Body: { csvData: string, mode?: 'validate'|'import' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';

interface CSVRow {
    name: string;
    item_code?: string;
    category?: string;
    unit?: string;
    quantity?: string | number;
    min_threshold?: string | number;
    location?: string;
    description?: string;
    per_unit_cost?: string | number;
}

interface ValidationError {
    row: number;
    field: string;
    message: string;
}

interface ImportResult {
    success: boolean;
    total: number;
    imported: number;
    skipped: number;
    errors: ValidationError[];
    items?: any[];
}

function parseCSV(csvText: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    // Parse header
    const headers = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));

    // Parse data rows
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.every(v => !v.trim())) continue; // skip empty rows

        const row: Record<string, string> = {};
        headers.forEach((header, idx) => {
            row[header] = (values[idx] || '').trim();
        });
        rows.push(row);
    }

    return { headers, rows };
}

function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current);
    return result;
}

function validateRow(row: Record<string, string>, rowIndex: number): { item: CSVRow | null; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // Name is required — support multiple column name variants
    const name = row['item_name'] || row['name'] || '';
    if (!name) {
        errors.push({ row: rowIndex, field: 'Item Name', message: 'Item name is required' });
    }

    // Category
    const category = row['category'] || '';

    // Unit — support "Base SKU (1 Unit)" column header (normalized to base_sku_(1_unit))
    const unit = row['base_sku_(1_unit)'] || row['base_sku'] || row['unit'] || 'units';

    // Quantity — support "Current Stock (Single Units)" column header
    const quantityStr = row['current_stock_(single_units)'] || row['current_stock'] || row['quantity'] || row['initial_quantity'] || '0';
    const quantity = parseInt(quantityStr);
    if (quantityStr && quantityStr !== '0' && isNaN(quantity)) {
        errors.push({ row: rowIndex, field: 'Current Stock', message: `Invalid stock value: "${quantityStr}"` });
    }
    if (!isNaN(quantity) && quantity < 0) {
        errors.push({ row: rowIndex, field: 'Current Stock', message: 'Stock cannot be negative' });
    }

    // Validate min_threshold if provided
    const thresholdStr = row['min_threshold'] || row['threshold'] || '10';
    const threshold = parseInt(thresholdStr);
    if (thresholdStr && thresholdStr !== '10' && isNaN(threshold)) {
        errors.push({ row: rowIndex, field: 'min_threshold', message: `Invalid threshold: "${thresholdStr}"` });
    }

    // Per unit cost
    const costStr = row['per_unit_cost'] || row['unit_cost'] || row['cost'] || row['price'] || '0';
    const cost = parseFloat(costStr);
    if (costStr && costStr !== '0' && isNaN(cost)) {
        errors.push({ row: rowIndex, field: 'Per Unit Cost', message: `Invalid cost value: "${costStr}"` });
    }
    if (!isNaN(cost) && cost < 0) {
        errors.push({ row: rowIndex, field: 'Per Unit Cost', message: 'Cost cannot be negative' });
    }

    if (errors.length > 0) {
        return { item: null, errors };
    }

    return {
        item: {
            name,
            item_code: row['item_code'] || row['code'] || '',
            category,
            unit,
            quantity: isNaN(quantity) ? 0 : quantity,
            min_threshold: isNaN(threshold) ? 10 : threshold,
            location: row['location'] || '',
            description: row['description'] || '',
            per_unit_cost: isNaN(cost) ? 0 : cost,
        },
        errors: [],
    };
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ propertyId: string }> }
) {
    const { propertyId } = await params;
    const supabase = await createClient();

    try {
        // Auth check
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { csvData, mode = 'import' } = body;
        // mode: 'validate' = only validate and return preview, 'import' = actually insert

        if (!csvData || typeof csvData !== 'string') {
            return NextResponse.json({ error: 'csvData is required as a string' }, { status: 400 });
        }

        // Parse CSV
        const { headers, rows } = parseCSV(csvData);

        if (rows.length === 0) {
            return NextResponse.json({ error: 'CSV file is empty or has no data rows' }, { status: 400 });
        }

        // Check for required 'item_name' / 'name' column
        const hasNameColumn = headers.includes('name') || headers.includes('item_name');
        if (!hasNameColumn) {
            return NextResponse.json({
                error: 'CSV must have an "Item Name" column',
                headers,
            }, { status: 400 });
        }

        // Validate all rows
        const allErrors: ValidationError[] = [];
        const validItems: CSVRow[] = [];

        for (let i = 0; i < rows.length; i++) {
            const { item, errors } = validateRow(rows[i], i + 2); // +2 for 1-indexed + header row
            allErrors.push(...errors);
            if (item) validItems.push(item);
        }

        // If validate-only mode, return preview
        if (mode === 'validate') {
            return NextResponse.json({
                success: true,
                total: rows.length,
                valid: validItems.length,
                invalid: rows.length - validItems.length,
                errors: allErrors,
                preview: validItems.slice(0, 50), // Preview first 50
                headers,
            });
        }

        // Import mode - insert valid items
        if (validItems.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No valid items to import',
                errors: allErrors,
            }, { status: 400 });
        }

        // Get organization_id from property
        const { data: property } = await supabase
            .from('properties')
            .select('organization_id, code')
            .eq('id', propertyId)
            .single();

        const orgId = property?.organization_id;
        const propCode = property?.code?.toUpperCase() || 'PROP';

        // Check for duplicate item_codes within the CSV
        const csvCodes = validItems.filter(i => i.item_code).map(i => i.item_code!);
        const duplicateCsvCodes = csvCodes.filter((code, idx) => csvCodes.indexOf(code) !== idx);

        if (duplicateCsvCodes.length > 0) {
            return NextResponse.json({
                success: false,
                error: `Duplicate item codes in CSV: ${[...new Set(duplicateCsvCodes)].join(', ')}`,
            }, { status: 400 });
        }

        // Check for existing item_codes in DB
        if (csvCodes.length > 0) {
            const { data: existingItems } = await supabase
                .from('stock_items')
                .select('item_code')
                .eq('property_id', propertyId)
                .in('item_code', csvCodes);

            if (existingItems && existingItems.length > 0) {
                const existingCodes = existingItems.map(i => i.item_code);
                return NextResponse.json({
                    success: false,
                    error: `These item codes already exist: ${existingCodes.join(', ')}`,
                    existingCodes,
                }, { status: 409 });
            }
        }

        // Prepare records for insertion
        const now = new Date().toISOString();
        const insertRecords = validItems.map(item => {
            const itemCode = item.item_code || `ITEM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
            const barcode = `${propCode}-${itemCode}-${Date.now().toString(36).toUpperCase()}`;

            return {
                property_id: propertyId,
                organization_id: orgId,
                item_code: itemCode,
                name: item.name,
                category: item.category || null,
                unit: item.unit || 'units',
                quantity: typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity as string) || 0,
                min_threshold: typeof item.min_threshold === 'number' ? item.min_threshold : parseInt(item.min_threshold as string) || 10,
                location: item.location || null,
                description: item.description || null,
                per_unit_cost: typeof item.per_unit_cost === 'number' ? item.per_unit_cost : parseFloat(item.per_unit_cost as string) || 0,
                created_by: user.id,
                barcode,
                barcode_format: 'CODE128',
                qr_code_data: {
                    item_code: itemCode,
                    name: item.name,
                    property_id: propertyId,
                    barcode,
                    generated_at: now,
                },
                barcode_generated_at: now,
            };
        });

        // Batch insert (Supabase handles up to 1000 rows per insert)
        const batchSize = 500;
        const insertedItems: any[] = [];

        for (let i = 0; i < insertRecords.length; i += batchSize) {
            const batch = insertRecords.slice(i, i + batchSize);
            const { data: inserted, error: insertError } = await supabase
                .from('stock_items')
                .insert(batch)
                .select();

            if (insertError) {
                return NextResponse.json({
                    success: false,
                    error: `Insert failed at batch ${Math.floor(i / batchSize) + 1}: ${insertError.message}`,
                    imported: insertedItems.length,
                    total: validItems.length,
                }, { status: 500 });
            }

            if (inserted) insertedItems.push(...inserted);
        }

        // Create initial stock movements for items with quantity > 0
        const movements = insertedItems
            .filter(item => item.quantity > 0)
            .map(item => ({
                item_id: item.id,
                property_id: propertyId,
                organization_id: orgId,
                action: 'initial',
                quantity_change: item.quantity,
                quantity_before: 0,
                quantity_after: item.quantity,
                user_id: user.id,
                notes: 'Initial stock entry (bulk import)',
            }));

        if (movements.length > 0) {
            for (let i = 0; i < movements.length; i += batchSize) {
                const batch = movements.slice(i, i + batchSize);
                await supabase.from('stock_movements').insert(batch);
            }
        }

        const result: ImportResult = {
            success: true,
            total: rows.length,
            imported: insertedItems.length,
            skipped: rows.length - validItems.length,
            errors: allErrors,
            items: insertedItems,
        };

        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        console.error('Bulk import error:', err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
