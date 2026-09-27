-- =============================================================
-- Secure DMS - WebAuthn Passkey Challenges
-- Version: 004
-- =============================================================

CREATE TABLE IF NOT EXISTS passkey_challenges (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT NOT NULL,
    challenge       VARCHAR(512) NOT NULL,
    type            ENUM('registration', 'authentication') NOT NULL,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_passkey_challenges_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE,

    INDEX idx_passkey_challenges_user (user_id),
    INDEX idx_passkey_challenges_expiry (expires_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
