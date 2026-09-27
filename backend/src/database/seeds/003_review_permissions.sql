-- =============================================================
-- Secure DMS - Seed Data: Review Permissions
-- Version: 003
-- Description: Adds review-specific permissions and assigns
--              them to the REVIEWER role.
--              Safe to re-run (uses ON DUPLICATE KEY UPDATE).
-- =============================================================

-- =============================================================
-- REVIEW PERMISSIONS
-- =============================================================
INSERT INTO permissions (name, description) VALUES
    ('reviews:read',   'View review queue and review history'),
    ('reviews:write',  'Approve, reject, or return cases and documents in review')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- =============================================================
-- ASSIGN TO REVIEWER ROLE
--    REVIEWER inherits reviews:read and reviews:write in
--    addition to their existing permissions.
-- =============================================================
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'REVIEWER'
  AND p.name IN ('reviews:read', 'reviews:write');
