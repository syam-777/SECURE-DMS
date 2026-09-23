-- =============================================================
-- Secure DMS - Migration 009: Approval Signatures
-- Version: 009
-- Description: Adds a per-approval cryptographic signature table
--              for the Digital Approval Signature (SIH) feature.
--              Every approved case review gets exactly one
--              ECDSA P-256 (SHA-256) signature binding the
--              reviewer, decision, case, and the approved
--              document/version SHA-256 snapshot.
--
-- Safety: Uses CREATE TABLE IF NOT EXISTS only. No existing
--         tables are altered or dropped.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- 1. APPROVAL_SIGNATURES TABLE
--    One row per approved case review (UNIQUE on review_id).
--    The signed canonical payload is stored verbatim, and the
--    signature is a base64-encoded ECDSA P-256 (SHA-256) value.
--    The private signing key is NEVER stored in the database.
-- =============================================================
CREATE TABLE IF NOT EXISTS approval_signatures (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    review_id  INT UNSIGNED NOT NULL,
    case_id    INT UNSIGNED NOT NULL,
    payload    TEXT         NOT NULL,
    signature  TEXT         NOT NULL,
    algorithm  VARCHAR(50)  NOT NULL,
    key_id     VARCHAR(100) NOT NULL,
    signed_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_as_review
        UNIQUE (review_id),
    CONSTRAINT fk_as_review
        FOREIGN KEY (review_id) REFERENCES case_reviews(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_as_case
        FOREIGN KEY (case_id) REFERENCES cases(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_as_case (case_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;