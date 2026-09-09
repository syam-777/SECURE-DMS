-- =============================================================
-- Secure DMS - Officer Verification Table
-- Version: 002
-- Description: Stores OFFICER role verification requests.
--              The raw official identifier is NEVER stored.
--              Only SHA-256(officialIdNumber) and the last 4
--              characters are persisted for display/debugging.
--
-- Promotion to OFFICER is ONLY allowed through this workflow:
--      pending -> approved (role_id set to OFFICER atomically)
--      pending -> rejected (role untouched)
--
-- NOTE ON USERS TABLE / TYPE COMPATIBILITY:
--   Mirrors 001_initial_schema.sql: user_id / reviewed_by use a
--   SIGNED INT to remain compatible with the pre-existing local
--   `users.id` column.
--
-- Safety: CREATE TABLE IF NOT EXISTS. Idempotent.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- OFFICER_VERIFICATIONS TABLE
--    One row per submission (verification history is retained;
--    there is deliberately NO unique constraint on (user_id,status)).
--    Enforce one pending request per user in application logic
--    inside a transaction.
-- =============================================================
CREATE TABLE IF NOT EXISTS officer_verifications (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id            INT          NOT NULL COMMENT 'Applicant (signed INT, matches users.id)',
    full_name          VARCHAR(255) NOT NULL COMMENT 'Applicant-provided name at submission time',
    official_id_type   VARCHAR(50)  NOT NULL COMMENT 'Identifier type label (e.g., TEST_ID)',
    official_id_hash   CHAR(64)     NOT NULL COMMENT 'SHA-256(normalized official id) - never raw value',
    official_id_last4  VARCHAR(4)   NULL COMMENT 'Last 4 chars of normalized id for display only',
    status             ENUM('pending','approved','rejected')
                                 NOT NULL DEFAULT 'pending',
    reviewed_by        INT          NULL COMMENT 'Admin who reviewed (signed INT, matches users.id)',
    submitted_at       TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    reviewed_at        TIMESTAMP    NULL,
    review_note        TEXT         NULL COMMENT 'Optional/rejection justification from reviewer',
    CONSTRAINT fk_ov_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_ov_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
        ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_ov_user       (user_id),
    INDEX idx_ov_status     (status),
    INDEX idx_ov_submitted  (submitted_at),
    INDEX idx_ov_reviewed   (reviewed_by),
    INDEX idx_ov_user_status (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;