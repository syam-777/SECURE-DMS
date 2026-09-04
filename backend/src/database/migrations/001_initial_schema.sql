-- =============================================================
-- Secure DMS - Initial Database Schema
-- Version: 001
-- Description: Creates all tables for the Secure Digital
--              Document Management System.
--
-- NOTE ON USERS TABLE / TYPE COMPATIBILITY:
--   A pre-existing `users` table (signed INT `id`) exists in the
--   local `secure_dms` database. To remain compatible with it,
--   every foreign-key column in this schema that references
--   users.id uses a SIGNED INT (not INT UNSIGNED). This also
--   keeps fresh installs consistent. The `role_id` column is
--   added to an existing users table by src/database/init.js
--   (idempotent reconciliation); on a fresh install the CREATE
--   TABLE IF NOT EXISTS below defines it fully.
--
-- Usage: Run via `npm run db:init` from the backend/ directory.
-- Safety: Uses CREATE TABLE IF NOT EXISTS. Does NOT drop
--         existing tables, databases, or data.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- 1. ROLES TABLE
--    Stores named roles for RBAC (e.g., ADMIN, OFFICER, etc.)
-- =============================================================
CREATE TABLE IF NOT EXISTS roles (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(50)  NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 2. PERMISSIONS TABLE
--    Granular permissions that can be assigned to roles.
--    Naming convention: resource:action (e.g., cases:write)
-- =============================================================
CREATE TABLE IF NOT EXISTS permissions (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255),
    created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 3. ROLE_PERMISSIONS TABLE
--    Many-to-many: which permissions belong to which role.
--    Composite primary key prevents duplicate assignments.
-- =============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
    role_id       INT UNSIGNED NOT NULL,
    permission_id INT UNSIGNED NOT NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_rp_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_rp_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id)
        ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 4. USERS TABLE
--    Stores user accounts. Password is stored as a bcrypt
--    hash in password_hash — never plaintext.
--    NOTE: `id` is a SIGNED INT for compatibility with the
--          pre-existing local users table (see header note).
--          `role_id` FK maps into the RBAC `roles` table.
--          Existing legacy users tables get `role_id` added
--          automatically by src/database/init.js.
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    username      VARCHAR(100) NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL COMMENT 'bcrypt hash — never store plaintext',
    full_name     VARCHAR(150) NOT NULL,
    role_id       INT UNSIGNED,
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_users_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_users_email     (email),
    INDEX idx_users_role      (role_id),
    INDEX idx_users_active    (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 5. CASES TABLE
--    A legal or administrative case tracked by the system.
--    case_number is a human-readable reference (e.g., CASE-2026-001).
--    created_by  = the user who opened the case.
--    assigned_to = the primary responsible user (officer).
--    Additional assignments live in case_assignments.
-- =============================================================
CREATE TABLE IF NOT EXISTS cases (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_number  VARCHAR(50)  NOT NULL UNIQUE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    status       ENUM('open','in_progress','under_review','closed','archived')
                           NOT NULL DEFAULT 'open',
    priority     ENUM('low','medium','high','critical')
                           NOT NULL DEFAULT 'medium',
    created_by   INT NOT NULL,
    assigned_to  INT,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cases_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_cases_assigned_to
        FOREIGN KEY (assigned_to) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_cases_status     (status),
    INDEX idx_cases_priority   (priority),
    INDEX idx_cases_created_by (created_by),
    INDEX idx_cases_assigned_to(assigned_to),
    INDEX idx_cases_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 6. CASE_ASSIGNMENTS TABLE
--    Many-to-many linking users to cases with a role label
--    (officer, reviewer, observer, etc.).
-- =============================================================
CREATE TABLE IF NOT EXISTS case_assignments (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id         INT UNSIGNED NOT NULL,
    user_id         INT          NOT NULL,
    assignment_role VARCHAR(50)  NOT NULL COMMENT 'officer, reviewer, observer, etc.',
    assigned_by     INT          NOT NULL COMMENT 'User who made the assignment',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_assignment UNIQUE (case_id, user_id, assignment_role),
    CONSTRAINT fk_ca_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_ca_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ca_assigned_by
        FOREIGN KEY (assigned_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_ca_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 7. DOCUMENTS TABLE
--    Logical document record. Stores metadata only — the
--    actual file lives on disk / object storage.  File details
--    for each version are in document_versions.
-- =============================================================
CREATE TABLE IF NOT EXISTS documents (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id         INT UNSIGNED,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    document_type   VARCHAR(50)  COMMENT 'evidence, report, contract, certificate, correspondence, other',
    status          ENUM('active','archived','deleted')
                               NOT NULL DEFAULT 'active',
    current_version INT UNSIGNED NOT NULL DEFAULT 1,
    uploaded_by     INT NOT NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_documents_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_documents_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_documents_case      (case_id),
    INDEX idx_documents_uploaded  (uploaded_by),
    INDEX idx_documents_status    (status),
    INDEX idx_documents_type      (document_type),
    INDEX idx_documents_created   (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 8. DOCUMENT_VERSIONS TABLE
--    Each row is one immutable version of a document's file.
--    (document_id, version_number) is unique so you cannot
--    accidentally duplicate a version for the same document.
-- =============================================================
CREATE TABLE IF NOT EXISTS document_versions (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id        INT UNSIGNED  NOT NULL,
    version_number     INT UNSIGNED  NOT NULL,
    file_path          VARCHAR(500)  NOT NULL COMMENT 'Relative path to stored file',
    original_file_name VARCHAR(255) NOT NULL,
    stored_file_name   VARCHAR(255)  NOT NULL COMMENT 'Renamed file on disk',
    mime_type          VARCHAR(100),
    file_size          BIGINT UNSIGNED COMMENT 'Size in bytes',
    checksum           VARCHAR(255)  COMMENT 'SHA-256 hash of file contents',
    uploaded_by        INT  NOT NULL,
    created_at         TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doc_version UNIQUE (document_id, version_number),
    CONSTRAINT fk_dv_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_dv_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_dv_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 9. AUDIT_LOGS TABLE
--    Append-only log of security-relevant events.
--    user_id is nullable for system-generated or unauthenticated
--    events (e.g., failed login attempts).
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT,
    action        VARCHAR(50)  NOT NULL COMMENT 'LOGIN, LOGOUT, CASE_CREATED, DOCUMENT_VIEWED, etc.',
    resource_type VARCHAR(50)  COMMENT 'user, case, document, document_version, permission',
    resource_id   INT UNSIGNED,
    ip_address    VARCHAR(45)  COMMENT 'Supports IPv4 and IPv6',
    user_agent    VARCHAR(500),
    details       JSON,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_audit_user     (user_id),
    INDEX idx_audit_action   (action),
    INDEX idx_audit_resource (resource_type, resource_id),
    INDEX idx_audit_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
