-- Migration: Change stock_movements.item_id from CASCADE to SET NULL
-- This preserves movement history when stock items are deleted

ALTER TABLE stock_movements ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE stock_movements
    DROP CONSTRAINT IF EXISTS stock_movements_item_id_fkey;

ALTER TABLE stock_movements
    ADD CONSTRAINT stock_movements_item_id_fkey
    FOREIGN KEY (item_id) REFERENCES stock_items(id) ON DELETE SET NULL;
