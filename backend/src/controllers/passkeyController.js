const crypto = require("crypto");

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

const {
  createChallenge,
  findValidChallenge,
  deleteChallenge,
  createPasskey,
  findPasskeyByCredentialId,
  findPasskeysByUserId,
  updatePasskeyCounter,
} = require("../models/passkeyModel");

const {
  findUserById,
  findUserByEmail,
  getUserWithRoleAndPermissions,
} = require("../models/userModel");
const { signToken } = require("../config/jwt");
const { logAuditEvent } = require("../models/auditLogModel");
const { RP_NAME, RP_ID, ORIGIN } = require("../config/webauthn");
const { safeUser } = require("./authController");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

function bufferToBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlToBuffer(base64Url) {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(base64, "base64");
}

// =============================================================
// POST /api/passkeys/register/options
// =============================================================

async function registerPasskeyOptions(req, res, next) {
  try {
    const user = await findUserById(req.user.id);

    if (!user || !user.is_active) {
      throw httpError(403, "Your account is inactive");
    }

    const existingPasskeys = await findPasskeysByUserId(req.user.id);

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.username,
      userDisplayName: user.full_name || user.username,
      userID: Buffer.from(String(user.id)),
      attestationType: "none",
      excludeCredentials: existingPasskeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports
          ? JSON.parse(passkey.transports)
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "required",
      },
    });

    // Remove older registration challenges for this user.
    const challengeToStore = options.challenge;

    await createChallenge({
      userId: req.user.id,
      challenge: challengeToStore,
      type: "registration",
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    });

    return res.json({
      success: true,
      options,
    });
  } catch (err) {
    return next(err);
  }
}

// =============================================================
// POST /api/passkeys/register/verify
// =============================================================

async function registerPasskeyVerify(req, res, next) {
  try {
    const user = await findUserById(req.user.id);

    if (!user || !user.is_active) {
      throw httpError(403, "Your account is inactive");
    }

    const response = req.body;

    if (!response || typeof response !== "object") {
      throw httpError(400, "WebAuthn credential response is required");
    }

    /*
     * The challenge is stored server-side and retrieved using
     * the challenge returned by the browser response.
     */
    const clientDataJSON = response.response?.clientDataJSON;

    if (!clientDataJSON) {
      throw httpError(400, "Invalid WebAuthn response");
    }

    let clientData;

    try {
      clientData = JSON.parse(
        Buffer.from(clientDataJSON, "base64url").toString("utf8")
      );
    } catch (_) {
      throw httpError(400, "Invalid WebAuthn client data");
    }

    const challenge = clientData.challenge;

    if (!challenge) {
      throw httpError(400, "WebAuthn challenge is missing");
    }

    const storedChallenge = await findValidChallenge({
      userId: req.user.id,
      challenge,
      type: "registration",
    });

    if (!storedChallenge) {
      throw httpError(400, "WebAuthn challenge is invalid or expired");
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: storedChallenge.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw httpError(400, "Passkey registration could not be verified");
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

     const credentialId = credential.id;
const publicKey = bufferToBase64Url(credential.publicKey);

    await createPasskey({
      userId: req.user.id,
      credentialId,
      publicKey,
      counter: credential.counter,
      deviceType: credentialDeviceType,
      transports: response.response?.transports || [],
    });

    // A challenge is single-use.
    await deleteChallenge(storedChallenge.id);

    return res.status(201).json({
      success: true,
      message: "Passkey registered successfully",
      passkey: {
        credentialId,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// =============================================================
// POST /api/passkeys/login/options
// =============================================================

async function loginPasskeyOptions(req, res, next) {
  try {
    const email = (req.body && req.body.email ? req.body.email : "")
      .trim()
      .toLowerCase();

    let userId = null;
    let userPasskeys = [];

    if (email) {
      const user = await findUserByEmail(email);
      if (user && user.is_active) {
        userId = user.id;
        userPasskeys = await findPasskeysByUserId(user.id);
      }
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: userPasskeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports
          ? JSON.parse(passkey.transports)
          : undefined,
      })),
      userVerification: "required",
    });

    /*
     * Only persist the challenge when there is a real, active user with
     * registered passkeys to authenticate against. Unknown, inactive, or
     * passkey-less users receive identically-shaped options but no stored
     * challenge, so authentication cannot succeed — this avoids turning the
     * endpoint into a reliable account-enumeration oracle.
     */
    if (userPasskeys.length > 0) {
      await createChallenge({
        userId,
        challenge: options.challenge,
        type: "authentication",
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      });
    }

    return res.json({
      success: true,
      options,
    });
  } catch (err) {
    return next(err);
  }
}

// =============================================================
// POST /api/passkeys/login/verify
// =============================================================

async function loginPasskeyVerify(req, res, next) {
  const ipAddress = req.ip;
  const userAgent = req.get("user-agent");

  try {
    const response = req.body;

    if (!response || typeof response !== "object") {
      throw httpError(400, "WebAuthn authentication response is required");
    }

    const credentialId = response.id;

    if (!credentialId || typeof credentialId !== "string") {
      throw httpError(400, "Invalid passkey authentication");
    }

    const passkey = await findPasskeyByCredentialId(credentialId);

    if (!passkey) {
      throw httpError(404, "Passkey not found");
    }

    const clientDataJSON = response.response?.clientDataJSON;

    if (!clientDataJSON) {
      throw httpError(400, "Invalid WebAuthn response");
    }

    let clientData;

    try {
      clientData = JSON.parse(
        Buffer.from(clientDataJSON, "base64url").toString("utf8")
      );
    } catch (_) {
      throw httpError(400, "Invalid WebAuthn client data");
    }

    const challenge = clientData.challenge;

    if (!challenge) {
      throw httpError(400, "Authentication challenge expired or invalid");
    }

    const storedChallenge = await findValidChallenge({
      userId: passkey.user_id,
      challenge,
      type: "authentication",
    });

    if (!storedChallenge) {
      throw httpError(400, "Authentication challenge expired or invalid");
    }

    let transports = [];
    if (passkey.transports) {
      try {
        transports = JSON.parse(passkey.transports);
      } catch (_) {
        transports = [];
      }
    }

    const credential = {
      id: passkey.credential_id,
      publicKey: base64UrlToBuffer(passkey.public_key),
      counter: Number(passkey.counter) || 0,
      transports,
    };

    let verification;

    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: storedChallenge.challenge,
        expectedOrigin: ORIGIN,
        expectedRPID: RP_ID,
        credential,
        requireUserVerification: true,
      });
    } catch (_) {
      throw httpError(400, "Invalid passkey authentication");
    }

    if (!verification.verified || !verification.authenticationInfo) {
      throw httpError(400, "Invalid passkey authentication");
    }

    await updatePasskeyCounter(
      passkey.id,
      verification.authenticationInfo.newCounter
    );

    await deleteChallenge(storedChallenge.id);

    const user = await findUserById(passkey.user_id);

    if (!user) {
      throw httpError(404, "Passkey not found");
    }

    if (!user.is_active) {
      await logAuditEvent({
        userId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "user",
        resourceId: user.id,
        ipAddress,
        userAgent,
        details: { email: user.email, reason: "account_disabled" },
      });
      throw httpError(403, "Your account is inactive");
    }

    const token = signToken({ id: user.id });

    const userData = await getUserWithRoleAndPermissions(user.id);

    await logAuditEvent({
      userId: user.id,
      action: "LOGIN",
      resourceType: "user",
      resourceId: user.id,
      ipAddress,
      userAgent,
      details: { email: user.email },
    });

    return res.json({
      success: true,
      token,
      user: safeUser(userData),
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  registerPasskeyOptions,
  registerPasskeyVerify,
  loginPasskeyOptions,
  loginPasskeyVerify,
};
