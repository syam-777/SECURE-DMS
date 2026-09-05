import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

function PasskeyPage() {
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const registerPasskey = async () => {
    try {
      setLoading(true);
      setStatus("Starting passkey registration...");

      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("You are not logged in. Please log in first.");
      }

      // Get WebAuthn registration options from backend
      const optionsResponse = await fetch(
        "http://localhost:5000/api/passkeys/register/options",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const optionsData = await optionsResponse.json();

      if (!optionsResponse.ok || !optionsData.success) {
        throw new Error(
          optionsData.message || "Could not start passkey registration"
        );
      }

      // Start Windows Hello / fingerprint / face / PIN
      setStatus("Waiting for device verification...");

      const credential = await startRegistration({
        optionsJSON: optionsData.options,
      });

      // Send credential to backend for verification
      setStatus("Verifying your passkey...");

      const verifyResponse = await fetch(
        "http://localhost:5000/api/passkeys/register/verify",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credential),
        }
      );

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        throw new Error(
          verifyData.message || "Passkey verification failed"
        );
      }

      setStatus("✅ Passkey registered successfully!");
    } catch (error) {
      console.error("Passkey registration error:", error);
      setStatus(`❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px", maxWidth: "600px", margin: "0 auto" }}>
      <h1>Secure DMS Passkey</h1>

      <p>
        Register this device with a passkey using Windows Hello,
        fingerprint, face recognition, or your device PIN.
      </p>

      <button
        onClick={registerPasskey}
        disabled={loading}
        style={{
          padding: "12px 20px",
          fontSize: "16px",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Registering..." : "Register Passkey"}
      </button>

      {status && (
        <p style={{ marginTop: "20px" }}>
          {status}
        </p>
      )}
    </div>
  );
}

export default PasskeyPage;