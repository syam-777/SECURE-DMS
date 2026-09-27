-- =============================================================
-- Secure DMS - Migration 007
-- Description: Adds document_classifications table for storing
--              per-version AI document classifications produced
--              by the "Classify with AI" feature.
--
--              Each row records the category chosen by Gemini for
--              one exact document version, plus the confidence,
--              a short reason, the Gemini model that produced it,
--              and when the classification occurred.
--
--              The UNIQUE(document_id, version_number) key means a
--              re-classification of the same version updates the
--              existing row (idempotent re-run).
--
-- Usage: Run via `npm run db:init` from the backend/ directory.
-- Safety: Uses CREATE TABLE IF NOT EXISTS. Does NOT drop
--         existing tables, databases, or data. Never touches
--         documents.document_type (the manually assigned type).
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- 1. DOCUMENT_CLASSIFICATIONS TABLE
--    Per-version AI classification history.
-- =============================================================
CREATE TABLE IF NOT EXISTS document_classifications (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id     INT UNSIGNED  NOT NULL,
    version_number  INT UNSIGNED  NOT NULL,
    category        ENUM(
                        'FIR',
                        'FIR Report',
                        'Investigation Report',
                        'Witness Statement',
                        'Charge Sheet',
                        'Forensic Report',
                        'Court Filing',
                        'Evidence',
                        'Legal Notice',
                        'Other'
                    ) NOT NULL COMMENT 'Allowed Secure DMS document category',
    confidence      DECIMAL(5,4)  NOT NULL DEFAULT 0 COMMENT 'Normalized 0.0000 - 1.0000',
    reason          VARCHAR(500)  NOT NULL DEFAULT '' COMMENT 'Short AI reason',
    model           VARCHAR(100)  NOT NULL COMMENT 'Gemini model name',
    classified_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this classification was produced',
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doc_classification_version UNIQUE (document_id, version_number),
    CONSTRAINT fk_class_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_class_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;