const RP_NAME = process.env.WEBAUTHN_RP_NAME || "Secure DMS";
const RP_ID = process.env.WEBAUTHN_RP_ID || "localhost";
const ORIGIN = process.env.WEBAUTHN_ORIGIN || "http://localhost:5173";

module.exports = {
  RP_NAME,
  RP_ID,
  ORIGIN,
};
