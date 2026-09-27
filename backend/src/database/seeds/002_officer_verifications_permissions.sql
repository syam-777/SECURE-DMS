-- =============================================================
-- Secure DMS - Seed Data: Officer Verification Permissions
-- Version: 002
-- Description: Adds the Phase 11 officer-verification permissions
--              and binds them to ADMIN and USER roles.
--              Safe to re-run (idempotent).
--
-- Permission ownership:
--   ADMIN  -> verifications:read, verifications:review
--   USER   -> verifications:submit, verifications:read
--   OFFICER / REVIEWER -> none of the verification permissions
-- =============================================================

-- =============================================================
-- PERMISSIONS
-- =============================================================
INSERT INTO permissions (name, description) VALUES
    ('verifications:submit', 'Submit an officer verification request'),
    ('verifications:read',   'View officer verification requests (own for USER, all for ADMIN)'),
    ('verifications:review', 'Approve or reject officer verification requests')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- =============================================================
-- ROLE-PERMISSION ASSIGNMENTS
-- =============================================================

-- ADMIN - can review and view all officer verification requests
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'ADMIN'
  AND p.name IN (
      'verifications:read',
      'verifications:review'
  );

-- USER - can submit a request and view their own request status
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'USER'
  AND p.name IN (
      'verifications:submit',
      'verifications:read'
  );

-- Enforce Phase 11 permission ownership: verifications:submit belongs to
-- USER only. Seed 001's "ADMIN gets every permission" cross-join absorbs
-- newly added permissions on the next run, so ADMIN would otherwise pick
-- up verifications:submit here. Revoke it so ADMIN holds only
-- verifications:read + verifications:review (this file always runs after
-- 001, so the state is stable across repeated runs).
DELETE rp FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.name = 'ADMIN'
  AND p.name = 'verifications:submit';