import { useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "./AuditLogsPage.css";
import { apiFetch } from "../api/api";

const formatTimestamp = (value) => {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
};

const formatAction = (action) => {
  if (!action) return "—";

  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getResourceLabel = (log) => {
  if (!log.resourceType && !log.resourceId) {
    return "—";
  }

  if (log.resourceId != null) {
    return `${log.resourceType || "Resource"} #${log.resourceId}`;
  }

  return log.resourceType || "—";
};

const getDetailsText = (details) => {
  if (!details) return "—";

  if (typeof details === "string") {
    return details;
  }

  try {
    return Object.entries(details)
      .map(([key, value]) => {
        const displayValue =
          typeof value === "object" && value !== null
            ? JSON.stringify(value)
            : String(value);

        return `${key}: ${displayValue}`;
      })
      .join(" • ");
  } catch {
    return "—";
  }
};

const getStatus = (action) => {
  if (!action) return "Success";

  if (
    action.includes("FAILED") ||
    action.includes("DENIED") ||
    action.includes("ERROR")
  ) {
    return "Security";
  }

  return "Success";
};

function AuditLogsPage() {
  const navigate = useNavigate();

  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [userFilter, setUserFilter] = useState("All Users");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadAuditLogs() {
      try {
        setLoading(true);
        setError("");

        const response = await apiFetch("/audit-logs?limit=100");

        if (!response?.success) {
          throw new Error(
            response?.message || "Failed to load audit logs"
          );
        }

        if (!cancelled) {
          setLogs(Array.isArray(response.data) ? response.data : []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Failed to load audit logs");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadAuditLogs();

    return () => {
      cancelled = true;
    };
  }, []);

  const actionOptions = useMemo(() => {
    const actions = logs
      .map((log) => formatAction(log.action))
      .filter(Boolean);

    return ["All Actions", ...new Set(actions)];
  }, [logs]);

  const userOptions = useMemo(() => {
    const users = logs
      .map((log) =>
        log.userId != null ? `User #${log.userId}` : "System"
      )
      .filter(Boolean);

    return ["All Users", ...new Set(users)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return logs.filter((log) => {
      const action = formatAction(log.action);
      const resource = getResourceLabel(log);
      const details = getDetailsText(log.details);
      const user =
        log.userId != null ? `User #${log.userId}` : "System";

      const matchesSearch =
        !term ||
        user.toLowerCase().includes(term) ||
        action.toLowerCase().includes(term) ||
        resource.toLowerCase().includes(term) ||
        details.toLowerCase().includes(term);

      const matchesAction =
        actionFilter === "All Actions" || action === actionFilter;

      const matchesUser =
        userFilter === "All Users" || user === userFilter;

      return matchesSearch && matchesAction && matchesUser;
    });
  }, [logs, searchTerm, actionFilter, userFilter]);

  const totalActivities = logs.length;

  const documentActivities = logs.filter(
    (log) => String(log.resourceType || "").toLowerCase() === "document"
  ).length;

  const caseActivities = logs.filter(
    (log) => String(log.resourceType || "").toLowerCase() === "case"
  ).length;

  const securityEvents = logs.filter(
    (log) => getStatus(log.action) === "Security"
  ).length;

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", {
        method: "POST",
      });
    } catch {
      // Even if the audit logout request fails, clear the local session.
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  };

  return (
    <div className="audit-page">
      <nav className="navbar">
        <div className="navbar-brand">
          <span className="brand-icon">&#128274;</span>
          <span className="brand-text">Secure DMS</span>
        </div>

        <div className="navbar-right">
          <button className="icon-button" aria-label="Notifications">
            &#128276;
          </button>

          <div className="user-area">
            <span className="user-avatar">A</span>
            <span className="user-name">Admin</span>
          </div>

          <button
            className="logout-button"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-body">
        <aside className="sidebar">
          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/dashboard"
          >
            Dashboard
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/cases"
          >
            Cases
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/documents"
          >
            Documents
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/ai-assistant"
          >
            AI Assistant
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/search"
          >
            Search
          </NavLink>

          <NavLink
            className={({ isActive }) =>
              "sidebar-item" + (isActive ? " active" : "")
            }
            to="/audit-logs"
          >
            Audit Logs
          </NavLink>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <h1 className="page-title">Audit Logs</h1>
            <p className="page-description">
              Track and review important activities performed within Secure
              DMS.
            </p>
          </div>

          <div className="summary-cards">
            <div className="summary-card">
              <span className="card-icon">&#128203;</span>
              <span className="card-value">{totalActivities}</span>
              <span className="card-label">Total Activities</span>
            </div>

            <div className="summary-card">
              <span className="card-icon">&#128196;</span>
              <span className="card-value">{documentActivities}</span>
              <span className="card-label">Document Activities</span>
            </div>

            <div className="summary-card">
              <span className="card-icon">&#128274;</span>
              <span className="card-value">{caseActivities}</span>
              <span className="card-label">Case Activities</span>
            </div>

            <div className="summary-card security-card">
              <span className="card-icon">&#9888;&#65039;</span>
              <span className="card-value">{securityEvents}</span>
              <span className="card-label">Security Events</span>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Search by user, action, resource, or details..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <div className="filter-field">
              <label htmlFor="action-filter">Action</label>

              <select
                id="action-filter"
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                {actionOptions.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="user-filter">User</label>

              <select
                id="user-filter"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
              >
                {userOptions.map((user) => (
                  <option key={user} value={user}>
                    {user}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-section">
            {loading ? (
              <div className="empty-state">
                <h3 className="empty-title">Loading audit records...</h3>
              </div>
            ) : error ? (
              <div className="empty-state">
                <h3 className="empty-title">
                  Failed to load audit records
                </h3>
                <p className="empty-text">{error}</p>
              </div>
            ) : filteredLogs.length > 0 ? (
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Details</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredLogs.map((log) => {
                    const action = formatAction(log.action);
                    const status = getStatus(log.action);

                    return (
                      <tr key={log.id}>
                        <td className="timestamp">
                          {formatTimestamp(log.createdAt)}
                        </td>

                        <td>
                          {log.userId != null
                            ? `User #${log.userId}`
                            : "System"}
                        </td>

                        <td>
                          <span
                            className={`action-badge action-${String(
                              log.action || ""
                            )
                              .toLowerCase()
                              .replace(/_/g, "-")}`}
                          >
                            {action}
                          </span>
                        </td>

                        <td className="resource">
                          {getResourceLabel(log)}
                        </td>

                        <td className="details">
                          {getDetailsText(log.details)}
                        </td>

                        <td>
                          <span
                            className={`status-badge status-${status.toLowerCase()}`}
                          >
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">&#128269;</span>
                <h3 className="empty-title">
                  No audit records found
                </h3>
                <p className="empty-text">
                  No audit records match your current search or filters.
                </p>
              </div>
            )}
          </div>

          <div className="security-notice">
            Audit logs are used for accountability, security monitoring, and
            investigation of suspicious activity.
          </div>
        </main>
      </div>
    </div>
  );
}

export default AuditLogsPage;