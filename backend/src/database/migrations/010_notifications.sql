-- =============================================================
-- Secure DMS - Migration 010: Notifications
-- Version: 010
-- Description: Adds a persistent per-user notification table used
--              by the dashboard bell / notification center.
--
-- SAFETY NOTES:
--   - One row per recipient (user_id is NOT NULL). There is NO
--     recipient_role column: role-wide events fan out to one row
--     per active recipient at creation time. This keeps notification
--     ownership strict and avoids cross-user leakage.
--   - case_id / document_id are nullable so a notification may link
--     to a case, a document, both, or neither.
--   - Uses CREATE TABLE IF NOT EXISTS. Does NOT drop existing
--     tables, databases, or data.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT          NOT NULL COMMENT 'Recipient (one row per recipient)',
    type        VARCHAR(50)  NOT NULL COMMENT 'CASE_ASSIGNED, CASE_APPROVED, DOCUMENT_UPLOADED, INTEGRITY_CHECK_FAILED, etc.',
    title       VARCHAR(255) NOT NULL,
    message     TEXT         NOT NULL,
    case_id     INT UNSIGNED NULL,
    document_id INT UNSIGNED NULL,
    is_read     BOOLEAN      NOT NULL DEFAULT FALSE,
    read_at     TIMESTAMP    NULL DEFAULT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    CONSTRAINT fk_notifications_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    CONSTRAINT fk_notifications_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE SET NULL ON UPDATE CASCADE,

    INDEX idx_notif_user_read (user_id, is_read, id),
    INDEX idx_notif_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;