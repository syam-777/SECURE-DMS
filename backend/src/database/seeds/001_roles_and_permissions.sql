-- =============================================================
-- Secure DMS - Seed Data: Roles & Permissions
-- Version: 001
-- Description: Inserts the default RBAC roles and permissions.
--              Safe to re-run (uses ON DUPLICATE KEY UPDATE).
-- =============================================================

-- =============================================================
-- ROLES
-- =============================================================
INSERT INTO roles (name, description) VALUES
    ('ADMIN',    'System administrator with full access'),
    ('OFFICER',  'Case officer responsible for managing assigned cases'),
    ('REVIEWER', 'Reviews and approves documents and case progress'),
    ('USER',     'Regular user with basic access')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- =============================================================
-- PERMISSIONS
-- =============================================================
INSERT INTO permissions (name, description) VALUES
    -- User management
    ('users:read',    'View user information'),
    ('users:write',   'Create and edit user accounts'),
    ('users:delete',  'Deactivate or delete user accounts'),

    -- Role management
    ('roles:read',    'View roles and permission mappings'),
    ('roles:write',   'Create, edit, or delete roles and permissions'),

    -- Case management
    ('cases:read',    'View case details'),
    ('cases:write',   'Create and edit cases'),
    ('cases:delete',  'Delete or archive cases'),
    ('cases:assign',  'Assign or unassign users to cases'),

    -- Document management
    ('documents:read',     'View document metadata'),
    ('documents:write',    'Upload new documents and edit metadata'),
    ('documents:delete',   'Soft-delete or archive documents'),
    ('documents:download', 'Download document files'),

    -- Version management
    ('versions:create', 'Upload new document versions'),
    ('versions:read',   'View document version history'),

    -- Audit logs
    ('audit:read', 'View security audit logs'),

    -- Dashboard
    ('dashboard:read', 'View dashboard statistics'),

    -- AI Assistant
    ('ai:access', 'Access AI assistant features')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- =============================================================
-- ROLE-PERMISSION ASSIGNMENTS
-- =============================================================

-- ADMIN gets every permission
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN';

-- OFFICER — can manage their own cases & documents
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'OFFICER'
  AND p.name IN (
      'users:read',
      'cases:read', 'cases:write',
      'documents:read', 'documents:write', 'documents:download',
      'versions:create', 'versions:read',
      'dashboard:read',
      'ai:access'
  );

-- REVIEWER — read-heavy, review/approve workflow
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'REVIEWER'
  AND p.name IN (
      'users:read',
      'cases:read',
      'documents:read', 'documents:download',
      'versions:read',
      'dashboard:read',
      'ai:access'
  );

-- USER — minimal read access
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'USER'
  AND p.name IN (
      'cases:read',
      'documents:read',
      'versions:read',
      'dashboard:read'
  );
