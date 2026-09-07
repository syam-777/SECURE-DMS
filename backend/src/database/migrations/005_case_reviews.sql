-- =============================================================
-- Secure DMS - Migration 005: Case & Document Reviews
-- Version: 005
-- Description: Adds review tables, new statuses, and review
--              permissions for the REVIEWER workflow.
--
-- Safety: Uses CREATE TABLE IF NOT EXISTS and idempotent
--         ALTER TABLE statements.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- 1. ADD 'returned' STATUS TO CASES
--    Extends the existing ENUM to support the "returned for
--    revision" workflow action.
-- =============================================================
ALTER TABLE cases
  MODIFY COLUMN status ENUM('open','in_progress','under_review','closed','archived','returned')
  NOT NULL DEFAULT 'open';

-- =============================================================
-- 2. ADD 'pending_review' STATUS TO DOCUMENTS
--    Allows documents to enter a review queue.
-- =============================================================
ALTER TABLE documents
  MODIFY COLUMN status ENUM('active','archived','deleted','pending_review')
  NOT NULL DEFAULT 'active';

-- =============================================================
-- 3. CASE_REVIEWS TABLE
--    Records each review decision (approve/reject/return) on
--    a case by a reviewer. Linked to the reviewer's user id.
-- =============================================================
CREATE TABLE IF NOT EXISTS case_reviews (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    case_id      INT UNSIGNED NOT NULL,
    reviewer_id  INT          NOT NULL,
    action       ENUM('approved','rejected','returned') NOT NULL,
    review_note  TEXT,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cr_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_cr_reviewer
        FOREIGN KEY (reviewer_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_cr_case     (case_id),
    INDEX idx_cr_reviewer (reviewer_id),
    INDEX idx_cr_action   (action),
    INDEX idx_cr_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =============================================================
-- 4. DOCUMENT_REVIEWS TABLE
--    Records each review decision on a document by a reviewer.
-- =============================================================
CREATE TABLE IF NOT EXISTS document_reviews (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id  INT UNSIGNED NOT NULL,
    reviewer_id  INT          NOT NULL,
    action       ENUM('approved','rejected','returned') NOT NULL,
    review_note  TEXT,
    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_dr_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_dr_reviewer
        FOREIGN KEY (reviewer_id) REFERENCES users(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    INDEX idx_dr_document (document_id),
    INDEX idx_dr_reviewer (reviewer_id),
    INDEX idx_dr_action   (action),
    INDEX idx_dr_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
