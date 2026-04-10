-- Migration: Add Barcode Support to Stock Module
-- Created: 2026-02-20
-- Description: Add barcode fields, indexes, and auto-generation trigger for stock items

-- Add barcode-related columns to stock_items table
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS barcode_format TEXT DEFAULT 'CODE128';
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS qr_code_data JSONB;
ALTER TABLE stock_items ADD COLUMN IF NOT EXISTS barcode_generated_at TIMESTAMPTZ;

-- Create unique index on barcode per property to prevent duplicates
-- Only indexes non-null barcodes to allow multiple null values
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_items_barcode_unique
  ON stock_items(property_id, barcode)
  WHERE barcode IS NOT NULL;

-- Create lookup index for fast barcode scanning/searching
CREATE INDEX IF NOT EXISTS idx_stock_items_barcode_lookup
  ON stock_items(barcode)
  WHERE barcode IS NOT NULL;

-- Create index for newly generated barcodes
CREATE INDEX IF NOT EXISTS idx_stock_items_barcode_generated_at
  ON stock_items(barcode_generated_at DESC);

-- Function to auto-generate barcode and QR code data on item creation
CREATE OR REPLACE FUNCTION generate_stock_barcode()
RETURNS TRIGGER AS $$
BEGIN
  -- Only generate barcode if not explicitly provided
  IF NEW.barcode IS NULL THEN
    -- Format: {PROPERTY_CODE}-ITEM-{epoch_timestamp}
    -- Example: ABC-ITEM-1708472334567
    NEW.barcode := UPPER(
      COALESCE(
        (SELECT code FROM properties WHERE id = NEW.property_id LIMIT 1),
        'STK'
      )
    ) || '-ITEM-' || (EXTRACT(EPOCH FROM NOW()) * 1000)::BIGINT::TEXT;

    NEW.barcode_format := 'CODE128';
    NEW.barcode_generated_at := NOW();
  END IF;

  -- Generate QR code metadata if not provided
  -- QR codes will contain this JSON data encoded
  IF NEW.qr_code_data IS NULL THEN
    NEW.qr_code_data := jsonb_build_object(
      'item_id', NEW.id::TEXT,
      'item_code', NEW.item_code,
      'name', NEW.name,
      'property_id', NEW.property_id::TEXT,
      'barcode', NEW.barcode,
      'quantity', NEW.quantity,
      'unit', NEW.unit,
      'created_at', NEW.created_at::TEXT
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists and recreate
DROP TRIGGER IF EXISTS trigger_generate_stock_barcode ON stock_items;
CREATE TRIGGER trigger_generate_stock_barcode
  BEFORE INSERT ON stock_items
  FOR EACH ROW
  EXECUTE FUNCTION generate_stock_barcode();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';
