-- =============================================================
-- Secure DMS - Blockchain Audit Ledger Table
-- Version: 006
-- Description: Application-level / private blockchain-style
--              hash-chain ledger stored in TiDB/MySQL.
--              NOT a decentralized or public blockchain.
--
--   Audit event -> data_hash -> block_hash -> next block's previous_hash
--
--   - block_index is 1-BASED and must be contiguous (1..N).
--   - previous_hash of block N equals block_hash of block N-1.
--   - block 1 (genesis) uses a fixed, all-zero previous_hash.
--   - Each audit_logs row maps to exactly ONE ledger block
--     (enforced by the UNIQUE constraint on audit_log_id).
--
-- Safety: CREATE TABLE IF NOT EXISTS. Idempotent.
-- =============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS blockchain_audit_ledger (
    id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    block_index   INT UNSIGNED NOT NULL COMMENT '1-based, contiguous block number',
    audit_log_id  BIGINT UNSIGNED NOT NULL COMMENT 'FK to audit_logs.id (one block per audit event)',
    data_hash     CHAR(64)     NOT NULL COMMENT 'SHA-256 of the canonical audit event payload (hex)',
    previous_hash CHAR(64)     NOT NULL COMMENT 'block_hash of previous block; all-zeros for genesis',
    block_hash    CHAR(64)     NOT NULL COMMENT 'SHA-256(previous_hash + block_index + data_hash + created_at) (hex)',
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ledger_audit_log
        FOREIGN KEY (audit_log_id) REFERENCES audit_logs(id)
        ON DELETE RESTRICT ON UPDATE CASCADE,
    UNIQUE KEY uq_ledger_block_index (block_index),
    UNIQUE KEY uq_ledger_audit_log   (audit_log_id),
    INDEX idx_ledger_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
