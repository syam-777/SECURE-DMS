-- =============================================================
-- Secure DMS - Passkeys / WebAuthn
-- Version: 003
-- =============================================================

CREATE TABLE IF NOT EXISTS passkeys (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    credential_id   VARCHAR(512) NOT NULL,
    public_key      TEXT NOT NULL,
    counter         BIGINT UNSIGNED NOT NULL DEFAULT 0,
    device_type     VARCHAR(50),
    transports      VARCHAR(255),
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at    TIMESTAMP NULL DEFAULT NULL,

    CONSTRAINT unique_passkey_credential UNIQUE (credential_id),

    CONSTRAINT fk_passkeys_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_passkeys_user (user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
