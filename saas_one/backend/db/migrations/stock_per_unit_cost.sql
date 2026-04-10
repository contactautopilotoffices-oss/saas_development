-- Migration: Add per_unit_cost column to stock_items
-- Stores the cost per single unit of each stock item

ALTER TABLE stock_items ADD COLUMN per_unit_cost NUMERIC DEFAULT 0;
