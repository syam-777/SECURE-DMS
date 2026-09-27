const jwt = require("jsonwebtoken");
require("dotenv").config();

const ISSUER = "secure-dms";
const AUDIENCE = "dms-web";

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "replace-with-a-long-random-secret") {
    const err = new Error(
      "JWT_SECRET is not configured. Set JWT_SECRET in the backend .env file."
    );
    err.name = "JwtConfigurationError";
    err.statusCode = 500;
    err.expose = false;
    throw err;
  }
  return secret;
}

function getExpiresIn() {
  return process.env.JWT_EXPIRES_IN || "2h";
}

/**
 * Sign a JWT for the given user id.
 * @param {{ id: number|string }} payloadData
 * @returns {string} signed JWT
 */
function signToken(payloadData) {
  const payload = { sub: String(payloadData.id) };
  const secret = getSecret();
  return jwt.sign(payload, secret, {
    expiresIn: getExpiresIn(),
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @returns {{ sub: string, iat:number, exp:number }}
 */
function verifyToken(token) {
  const secret = getSecret();
  return jwt.verify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

module.exports = {
  signToken,
  verifyToken,
  ISSUER,
  AUDIENCE,
};
