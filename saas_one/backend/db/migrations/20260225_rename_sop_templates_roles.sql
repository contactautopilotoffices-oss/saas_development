-- Rename applicable_roles to assigned_to as requested
ALTER TABLE sop_templates RENAME COLUMN applicable_roles TO assigned_to;
