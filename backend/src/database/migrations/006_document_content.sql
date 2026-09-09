-- =============================================================
-- Secure DMS - Migration 006
-- Description: Adds document_contents table for storing
--              extracted text from documents (OCR and native
--              text extraction) to enable full-content search.
--
-- Usage: Run via `npm run db:init` from the backend/ directory.
-- Safety: Uses CREATE TABLE IF NOT EXISTS. Does NOT drop
--         existing tables, databases, or data.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- 1. DOCUMENT_CONTENTS TABLE
--    Stores extracted text for each document version.
--    Populated asynchronously after upload/version creation.
--    Used for full-text content search via LIKE queries.
-- =============================================================
CREATE TABLE IF NOT EXISTS document_contents (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id      INT UNSIGNED  NOT NULL,
    version_number   INT UNSIGNED  NOT NULL,
    extracted_text   LONGTEXT,
    extraction_method VARCHAR(50)  COMMENT 'pdf_text, ocr, txt, docx, xlsx, image_ocr',
    is_ocr           BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT unique_doc_content_version UNIQUE (document_id, version_number),
    CONSTRAINT fk_dc_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_dc_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
