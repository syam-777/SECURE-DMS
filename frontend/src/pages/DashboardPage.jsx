import { NavLink, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiFetch } from "../api/api";
import "./DashboardPage.css";

function DashboardPage() {
  const navigate = useNavigate();

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const data = await apiFetch("/dashboard");

        if (!data.success) {
          throw new Error(data.message || "Failed to load dashboard");
        }

        setDashboardData(data.data);
      } catch (err) {
        console.error("Dashboard loading error:", err);
        setError(err.message || "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  };

  const getCurrentUser = () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  };

  const user = getCurrentUser();

  const displayName =
    user.full_name ||
    user.fullName ||
    user.username ||
    user.email ||
    "User";

  const formatDate = (dateValue) => {
    if (!dateValue) {
      return "—";
    }

    try {
      return new Date(dateValue).toLocaleDateString();
    } catch {
      return "—";
    }
  };

  const formatActivityTime = (dateValue) => {
    if (!dateValue) {
      return "—";
    }

    try {
      return new Date(dateValue).toLocaleString();
    } catch {
      return "—";
    }
  };

  const formatAction = (action) => {
    if (!action) {
      return "Activity";
    }

    return String(action)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  };

  const getActivityUser = (activityUser) => {
    if (!activityUser) {
      return "System";
    }

    if (typeof activityUser === "string") {
      return activityUser;
    }

    return (
      activityUser.full_name ||
      activityUser.fullName ||
      activityUser.username ||
      activityUser.email ||
      "System"
    );
  };

  if (loading) {
    return (
      <div className="dashboard-loading">
        Loading dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-error">
        <h2>Unable to load dashboard</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  if (!dashboardData) {
    return (
      <div className="dashboard-error">
        <h2>No dashboard data available</h2>
        <button onClick={() => window.location.reload()}>
          Try Again
        </button>
      </div>
    );
  }

  const summary = dashboardData.summary || {};
  const recentCases = dashboardData.recentCases || [];
  const recentActivity = dashboardData.recentActivity || [];

  return (
    <div className="dashboard-page">
      <nav className="navbar">
        <div className="navbar-brand">
          <Link to="/dashboard">Secure DMS</Link>
        </div>

        <div className="navbar-links">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/cases"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Cases
          </NavLink>

          <NavLink
            to="/documents"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Documents
          </NavLink>

          <NavLink
            to="/ai-assistant"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            AI Assistant
          </NavLink>

          <NavLink
            to="/search"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Search
          </NavLink>

          <NavLink
            to="/audit-logs"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Audit Logs
          </NavLink>

          {user.role === "ADMIN" && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              User Management
            </NavLink>
          )}

          <NavLink
            to="/passkey"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            Passkey
          </NavLink>
        </div>

        <div className="navbar-user">
          <span className="user-name">{displayName}</span>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </nav>

      <main className="main-content">
        <div className="welcome-section">
          <h1 className="welcome-title">
            Welcome back, {displayName}
          </h1>

          <p className="welcome-subtitle">
            Here is what is happening with your documents today.
          </p>
        </div>

        <div className="summary-cards">
          <Link
            className="summary-card"
            to="/cases"
            aria-label={`Total Cases: ${summary.totalCases ?? 0}`}
          >
            <span className="card-icon">📁</span>

            <span className="card-value">
              {summary.totalCases ?? 0}
            </span>

            <span className="card-label">
              Total Cases
            </span>
          </Link>

          <Link
            className="summary-card"
            to="/documents"
            aria-label={`Total Documents: ${
              summary.totalDocuments ?? 0
            }`}
          >
            <span className="card-icon">📄</span>

            <span className="card-value">
              {summary.totalDocuments ?? 0}
            </span>

            <span className="card-label">
              Total Documents
            </span>
          </Link>

          <Link
            className="summary-card"
            to="/documents"
            aria-label={`Pending Reviews: ${
              summary.pendingReviews ?? 0
            }`}
          >
            <span className="card-icon">⏳</span>

            <span className="card-value">
              {summary.pendingReviews ?? 0}
            </span>

            <span className="card-label">
              Pending Reviews
            </span>
          </Link>

          <Link
            className="summary-card"
            to="/audit-logs"
            aria-label={`Recent Activity: ${
              summary.recentActivityCount ?? 0
            }`}
          >
            <span className="card-icon">📋</span>

            <span className="card-value">
              {summary.recentActivityCount ?? 0}
            </span>

            <span className="card-label">
              Recent Activity
            </span>
          </Link>
        </div>

        <div className="dashboard-sections">
          <section className="section recent-cases">
            <h2 className="section-title">
              Recent Cases
            </h2>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Case ID</th>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>

              <tbody>
                {recentCases.length > 0 ? (
                  recentCases.map((caseItem) => (
                    <tr key={caseItem.id}>
                      <td>
                        {caseItem.caseNumber ||
                          caseItem.id ||
                          "—"}
                      </td>

                      <td>
                        {caseItem.title || "Untitled Case"}
                      </td>

                      <td>
                        <span
                          className={`status-badge status-${String(
                            caseItem.status || "unknown"
                          ).toLowerCase()}`}
                        >
                          {caseItem.status || "Unknown"}
                        </span>
                      </td>

                      <td>
                        {formatDate(caseItem.updatedAt)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4">
                      No recent cases found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="section recent-activity">
            <h2 className="section-title">
              Recent Activity
            </h2>

            <ul className="activity-list">
              {recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <li
                    className="activity-item"
                    key={activity.id}
                  >
                    <div className="activity-info">
                      <span className="activity-action">
                        {formatAction(activity.action)}
                      </span>

                      <span className="activity-doc">
                        {activity.resourceType
                          ? `${activity.resourceType}${
                              activity.resourceId
                                ? ` #${activity.resourceId}`
                                : ""
                            }`
                          : "System activity"}
                      </span>
                    </div>

                    <div className="activity-meta">
                      <span className="activity-user">
                        {getActivityUser(activity.user)}
                      </span>

                      <span className="activity-time">
                        {formatActivityTime(
                          activity.createdAt
                        )}
                      </span>
                    </div>
                  </li>
                ))
              ) : (
                <li className="activity-item">
                  <div className="activity-info">
                    <span className="activity-action">
                      No recent activity
                    </span>
                  </div>
                </li>
              )}
            </ul>
          </section>
        </div>
      </main>
    </div>
  );
}

export default DashboardPage;