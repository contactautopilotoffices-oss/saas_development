-- Migration: Change stock quantity columns from INTEGER to NUMERIC to support sub-unit movements
-- e.g., taking 500ml from a 1 Litre stock → 0.5 Litre remaining

ALTER TABLE stock_items ALTER COLUMN quantity TYPE NUMERIC USING quantity::NUMERIC;
ALTER TABLE stock_items ALTER COLUMN min_threshold TYPE NUMERIC USING min_threshold::NUMERIC;

ALTER TABLE stock_movements ALTER COLUMN quantity_change TYPE NUMERIC USING quantity_change::NUMERIC;
ALTER TABLE stock_movements ALTER COLUMN quantity_before TYPE NUMERIC USING quantity_before::NUMERIC;
ALTER TABLE stock_movements ALTER COLUMN quantity_after TYPE NUMERIC USING quantity_after::NUMERIC;
