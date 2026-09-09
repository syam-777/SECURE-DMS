const { pool } = require("../config/database");

// =============================================================
// WebAuthn Challenge Operations
// =============================================================

async function createChallenge({ userId, challenge, type, expiresAt }) {
  const [result] = await pool.execute(
    `INSERT INTO passkey_challenges
      (user_id, challenge, type, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, challenge, type, expiresAt]
  );

  return {
    id: result.insertId,
    userId,
    challenge,
    type,
    expiresAt,
  };
}

async function findValidChallenge({ userId, challenge, type }) {
  const [rows] = await pool.execute(
    `SELECT *
       FROM passkey_challenges
      WHERE user_id = ?
        AND challenge = ?
        AND type = ?
        AND expires_at > CURRENT_TIMESTAMP
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, challenge, type]
  );

  return rows[0] || null;
}

async function deleteChallenge(id) {
  await pool.execute(
    `DELETE FROM passkey_challenges WHERE id = ?`,
    [id]
  );
}

async function deleteExpiredChallenges() {
  const [result] = await pool.execute(
    `DELETE FROM passkey_challenges
      WHERE expires_at <= CURRENT_TIMESTAMP`
  );

  return result.affectedRows;
}

// =============================================================
// Passkey Operations
// =============================================================

async function createPasskey({
  userId,
  credentialId,
  publicKey,
  counter,
  deviceType,
  transports,
}) {
  const [result] = await pool.execute(
    `INSERT INTO passkeys
      (user_id, credential_id, public_key, counter, device_type, transports)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      userId,
      credentialId,
      publicKey,
      counter,
      deviceType || null,
      transports ? JSON.stringify(transports) : null,
    ]
  );

  return {
    id: result.insertId,
    userId,
    credentialId,
    publicKey,
    counter,
    deviceType: deviceType || null,
    transports: transports || [],
  };
}

async function findPasskeyByCredentialId(credentialId) {
  const [rows] = await pool.execute(
    `SELECT *
       FROM passkeys
      WHERE credential_id = ?
      LIMIT 1`,
    [credentialId]
  );

  return rows[0] || null;
}

async function findPasskeysByUserId(userId) {
  const [rows] = await pool.execute(
    `SELECT id,
            user_id,
            credential_id,
            counter,
            device_type,
            transports,
            created_at,
            last_used_at
       FROM passkeys
      WHERE user_id = ?
      ORDER BY created_at DESC`,
    [userId]
  );

  return rows;
}

async function updatePasskeyCounter(id, counter) {
  await pool.execute(
    `UPDATE passkeys
        SET counter = ?,
            last_used_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [counter, id]
  );
}

async function deletePasskey(id, userId) {
  const [result] = await pool.execute(
    `DELETE FROM passkeys
      WHERE id = ?
        AND user_id = ?`,
    [id, userId]
  );

  return result.affectedRows > 0;
}

module.exports = {
  createChallenge,
  findValidChallenge,
  deleteChallenge,
  deleteExpiredChallenges,

  createPasskey,
  findPasskeyByCredentialId,
  findPasskeysByUserId,
  updatePasskeyCounter,
  deletePasskey,
};
