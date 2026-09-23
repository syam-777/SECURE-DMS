-- =============================================================
-- Secure DMS - Migration 008
-- Description: Adds document_entities table for storing per-version
--              AI-extracted entities (people, organizations,
--              locations, dates, case/reference numbers) produced
--              by the "AI Entity Extraction" feature.
--
--              Each row records the entities Gemini extracted from
--              one exact document version, the model that produced
--              them, and when extraction occurred.
--
--              The UNIQUE(document_id, version_number) key means a
--              re-extraction of the same version updates the existing
--              row (idempotent re-run). entities is a JSON array of
--              normalized, server-validated entity groups.
--
-- Usage: Run via `npm run db:init` from the backend/ directory.
-- Safety: Uses CREATE TABLE IF NOT EXISTS. Does NOT drop
--         existing tables, databases, or data. Never touches
--         documents.document_type or document contents.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- =============================================================
-- 1. DOCUMENT_ENTITIES TABLE
--    Per-version AI entity extraction results.
-- =============================================================
CREATE TABLE IF NOT EXISTS document_entities (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    document_id     INT UNSIGNED  NOT NULL,
    version_number  INT UNSIGNED  NOT NULL,
    entities        JSON          NOT NULL COMMENT 'Normalized entity groups: {"people":[],"organizations":[],"locations":[],"dates":[],"caseReferenceNumbers":[]}',
    model           VARCHAR(100)  NOT NULL COMMENT 'Gemini model name',
    extracted_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When this extraction was produced',
    created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_doc_entities_version UNIQUE (document_id, version_number),
    CONSTRAINT fk_entities_document
        FOREIGN KEY (document_id) REFERENCES documents(id)
        ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_entities_document (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;