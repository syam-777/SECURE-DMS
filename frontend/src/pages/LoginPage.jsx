import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { startAuthentication } from "@simplewebauthn/browser";
import "./LoginPage.css";

function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
const handleSubmit = async (event) => {
  event.preventDefault();

  try {
    const response = await fetch("http://localhost:5000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || "Login failed");
    }

    // Store JWT for authenticated API requests
    localStorage.setItem("token", data.token);

    // Store user information if returned by the backend
    if (data.user) {
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    console.log("✅ Login successful");

    navigate("/dashboard");
  } catch (error) {
    console.error("Login error:", error);
    alert(error.message);
  }
};

  const handlePasskeyLogin = async () => {
    const normalizedEmail = email.trim();

    if (!normalizedEmail) {
      alert("Please enter your email to continue with passkey login.");
      return;
    }

    try {
      setPasskeyLoading(true);

      const optionsResponse = await fetch(
        "http://localhost:5000/api/passkeys/login/options",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ email: normalizedEmail }),
        }
      );

      const optionsData = await optionsResponse.json();

      if (!optionsResponse.ok || !optionsData.success) {
        throw new Error(optionsData.message || "Could not start passkey login");
      }

      const credential = await startAuthentication({
        optionsJSON: optionsData.options,
      });

      const verifyResponse = await fetch(
        "http://localhost:5000/api/passkeys/login/verify",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(credential),
        }
      );

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok || !verifyData.success) {
        throw new Error(verifyData.message || "Passkey login failed");
      }

      // Store JWT for authenticated API requests
      localStorage.setItem("token", verifyData.token);

      // Store user information if returned by the backend
      if (verifyData.user) {
        localStorage.setItem("user", JSON.stringify(verifyData.user));
      }

      navigate("/dashboard");
    } catch (error) {
      if (
        error.name === "NotAllowedError" ||
        error.code === "ERROR_CEREMONY_ABORTED"
      ) {
        alert("Passkey authentication was cancelled. Please try again.");
      } else {
        const message =
          error instanceof Error &&
          typeof error.message === "string" &&
          error.message.trim()
            ? error.message
            : "Passkey login failed. Please try again.";
        alert(message);
      }
    } finally {
      setPasskeyLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div className="login-page">
      <div className="login-container">
        <div className="login-header">
          <div className="logo">
            <span className="logo-icon">&#128274;</span>
            <span className="logo-text">Secure DMS</span>
          </div>
          <p className="logo-tagline">Digital Document Management System</p>
        </div>

        <h1 className="login-title">Welcome Back</h1>
        <p className="login-subtitle">Sign in to access your documents</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrapper">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={togglePasswordVisibility}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </div>
          </div>

          <button type="submit" className="login-button">
            Login
          </button>

          <div className="login-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="passkey-button"
            onClick={handlePasskeyLogin}
            disabled={passkeyLoading}
          >
            {passkeyLoading ? "Waiting for device..." : "Login with Passkey"}
          </button>
        </form>

        <div className="login-footer">
          <p className="register-link">
            Don&apos;t have an account? <Link to="/register">Register</Link>
          </p>
          <p className="security-message">
            Your documents are protected with secure access control.
          </p>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
