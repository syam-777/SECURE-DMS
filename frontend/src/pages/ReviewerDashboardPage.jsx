import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./ReviewerDashboardPage.css";

function ReviewerDashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toasts, setToasts] = useState([]);

  const getCurrentUser = () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  };

  const currentUser = getCurrentUser();
  const displayName =
    currentUser.full_name ||
    currentUser.fullName ||
    currentUser.username ||
    currentUser.email ||
    "Reviewer";

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const handleAuthError = useCallback(
    (err, permissionMessage) => {
      if (err.status !== 401 && err.status !== 403) {
        return false;
      }
      if (err.status === 403) {
        showToast(permissionMessage, "error");
      } else {
        showToast("Session expired. Please log in again.", "error");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
      }
      return true;
    },
    [navigate, showToast]
  );

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        setError("");
        const data = await apiFetch("/reviews/stats");
        if (!data.success) {
          throw new Error(data.message || "Failed to load review statistics");
        }
        setStats(data.stats);
      } catch (err) {
        if (
          !handleAuthError(
            err,
            "You do not have permission to view the reviewer dashboard."
          )
        ) {
          setError(err.message || "Failed to load review statistics");
        }
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, [handleAuthError]);

  if (loading) {
    return (
      <div className="reviewer-dashboard-page">
        <AppLayout>
            <div className="dashboard-loading">Loading reviewer dashboard...</div>
        </AppLayout>
      </div>
    );
  }

  const pendingCases = stats?.pendingCases ?? 0;
  const approvedCases = stats?.approvedCases ?? 0;
  const rejectedCases = stats?.rejectedCases ?? 0;
  const returnedCases = stats?.returnedCases ?? 0;
  const pendingDocuments = stats?.pendingDocuments ?? 0;
  const approvedDocuments = stats?.approvedDocuments ?? 0;
  const rejectedDocuments = stats?.rejectedDocuments ?? 0;
  const returnedDocuments = stats?.returnedDocuments ?? 0;

  const totalPending = pendingCases + pendingDocuments;

  return (
    <div className="reviewer-dashboard-page">
      <AppLayout>
          {error && (
            <div className="dashboard-error">
              <h2>Unable to load reviewer dashboard</h2>
              <p>{error}</p>
              <button onClick={() => window.location.reload()}>Try Again</button>
            </div>
          )}

          {!error && (
            <>
              <div className="welcome-section">
                <h1 className="welcome-title">
                  Reviewer Dashboard
                </h1>
                <p className="welcome-subtitle">
                  Welcome back, {displayName}. Here is an overview of cases and
                  documents awaiting your review.
                </p>
              </div>

              <div className="summary-cards">
                <Link
                  className="summary-card"
                  to="/review-queue"
                  aria-label={`Pending Reviews: ${totalPending}`}
                >
                  <span className="card-icon">&#9203;</span>
                  <span className="card-value">{totalPending}</span>
                  <span className="card-label">Pending Reviews</span>
                </Link>

                <Link
                  className="summary-card"
                  to="/review-queue"
                  aria-label={`Approved: ${
                    approvedCases + approvedDocuments
                  }`}
                >
                  <span className="card-icon">&#9989;</span>
                  <span className="card-value">
                    {approvedCases + approvedDocuments}
                  </span>
                  <span className="card-label">Approved</span>
                </Link>

                <Link
                  className="summary-card"
                  to="/review-queue"
                  aria-label={`Rejected: ${
                    rejectedCases + rejectedDocuments
                  }`}
                >
                  <span className="card-icon">&#10060;</span>
                  <span className="card-value">
                    {rejectedCases + rejectedDocuments}
                  </span>
                  <span className="card-label">Rejected</span>
                </Link>

                <Link
                  className="summary-card"
                  to="/review-queue"
                  aria-label={`Returned: ${
                    returnedCases + returnedDocuments
                  }`}
                >
                  <span className="card-icon">&#128257;</span>
                  <span className="card-value">
                    {returnedCases + returnedDocuments}
                  </span>
                  <span className="card-label">Returned</span>
                </Link>
              </div>

              <div className="dashboard-sections">
                <section className="section">
                  <div className="section-header">
                    <h2 className="section-title">Cases Awaiting Review</h2>
                    <Link to="/review-queue" className="section-link">
                      View All
                    </Link>
                  </div>
                  <div className="stat-rows">
                    <div className="stat-row">
                      <span className="stat-label">Pending Cases</span>
                      <span className="stat-value">{pendingCases}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Approved Cases</span>
                      <span className="stat-value">{approvedCases}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Rejected Cases</span>
                      <span className="stat-value">{rejectedCases}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Returned Cases</span>
                      <span className="stat-value">{returnedCases}</span>
                    </div>
                  </div>
                </section>

                <section className="section">
                  <div className="section-header">
                    <h2 className="section-title">Documents Awaiting Review</h2>
                    <Link to="/review-queue" className="section-link">
                      View All
                    </Link>
                  </div>
                  <div className="stat-rows">
                    <div className="stat-row">
                      <span className="stat-label">Pending Documents</span>
                      <span className="stat-value">{pendingDocuments}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Approved Documents</span>
                      <span className="stat-value">{approvedDocuments}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Rejected Documents</span>
                      <span className="stat-value">{rejectedDocuments}</span>
                    </div>
                    <div className="stat-row">
                      <span className="stat-label">Returned Documents</span>
                      <span className="stat-value">{returnedDocuments}</span>
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
      </AppLayout>

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReviewerDashboardPage;
