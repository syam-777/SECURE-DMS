import { useCallback, useEffect, useRef, useState } from "react";
import "./AuditLogsPage.css";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

// Empty string means "no filter" for both dropdowns. The backend treats an
// empty filter exactly the same way, so the sentinel needs no translation.
const ALL_FILTER = "";

// The backend maps userId=0 to `user_id IS NULL`, i.e. system /
// unauthenticated events such as a failed login.
const SYSTEM_USER = "0";

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
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Server-side pagination. `total` and `totalPages` come from the API
  // `pagination` envelope, never from the length of the current page.
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // `searchInput` is the raw controlled input; `searchTerm` is the debounced
  // value actually sent to the API.
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [actionFilter, setActionFilter] = useState(ALL_FILTER);
  const [userFilter, setUserFilter] = useState(ALL_FILTER);

  // Loaded once from /audit-logs/filters. Deriving these from the visible
  // page would make the dropdowns change on every page and would hide any
  // action that only appears further down the ledger.
  const [actionOptions, setActionOptions] = useState([]);
  const [userOptions, setUserOptions] = useState([]);

  // Holds the in-flight request so a superseded or unmounted fetch is
  // aborted instead of writing state.
  const requestRef = useRef(null);

  // Blockchain audit ledger verification state
  const [ledgerResult, setLedgerResult] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");

  const runLedgerVerification = async () => {
    try {
      setLedgerLoading(true);
      setLedgerError("");
      setLedgerResult(null);
      const res = await apiFetch("/audit-logs/blockchain/verify");
      if (res && res.data) {
        setLedgerResult(res.data);
      } else {
        setLedgerError("Unexpected response from ledger verification");
      }
    } catch (err) {
      setLedgerError(err.message || "Ledger verification failed");
    } finally {
      setLedgerLoading(false);
    }
  };

  // Load the dropdown options once. Failures are non-fatal: the dropdowns
  // simply fall back to offering only "All".
  useEffect(() => {
    let cancelled = false;

    async function loadFilterOptions() {
      try {
        const response = await apiFetch("/audit-logs/filters");

        if (cancelled) return;

        if (response?.success && response.data) {
          setActionOptions(
            Array.isArray(response.data.actions) ? response.data.actions : []
          );
          setUserOptions(
            Array.isArray(response.data.users) ? response.data.users : []
          );
        }
      } catch {
        if (!cancelled) {
          setActionOptions([]);
          setUserOptions([]);
        }
      }
    }

    loadFilterOptions();

    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce the search box, and jump back to page 1 whenever the applied
  // term changes so the user never lands on an out-of-range page.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadAuditLogs = useCallback(async () => {
    if (requestRef.current) {
      requestRef.current.abort();
    }

    const controller = new AbortController();
    requestRef.current = controller;

    try {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort: "created_at",
        order: "desc",
      });

      if (actionFilter) {
        params.set("action", actionFilter);
      }

      if (userFilter) {
        params.set("userId", userFilter);
      }

      if (searchTerm) {
        params.set("search", searchTerm);
      }

      const response = await apiFetch(`/audit-logs?${params.toString()}`, {
        signal: controller.signal,
      });

      if (!response?.success) {
        throw new Error(
          response?.message || "Failed to load audit logs"
        );
      }

      const serverTotal = Number(response.pagination?.total) || 0;
      const serverTotalPages = Number(response.pagination?.totalPages) || 0;

      setLogs(Array.isArray(response.data) ? response.data : []);
      setTotal(serverTotal);
      setTotalPages(serverTotalPages);

      // If the result set shrank below the page currently shown (for
      // example records were removed server-side), fall back to the last
      // page that still exists. Handled here rather than in an effect so it
      // does not cost an extra render pass.
      if (serverTotalPages > 0 && page > serverTotalPages) {
        setPage(serverTotalPages);
      }
    } catch (err) {
      if (controller.signal.aborted) return;

      setError(err.message || "Failed to load audit logs");
      setLogs([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [page, actionFilter, userFilter, searchTerm]);

  useEffect(() => {
    loadAuditLogs();

    return () => {
      if (requestRef.current) {
        requestRef.current.abort();
      }
    };
  }, [loadAuditLogs]);

  const handleActionChange = (event) => {
    setActionFilter(event.target.value);
    setPage(1);
  };

  const handleUserChange = (event) => {
    setUserFilter(event.target.value);
    setPage(1);
  };

  const canGoPrevious = page > 1 && !loading;
  const canGoNext = page < totalPages && !loading;

  const handlePrevious = () => {
    setPage((current) => Math.max(1, current - 1));
  };

  const handleNext = () => {
    setPage((current) =>
      current < totalPages ? current + 1 : current
    );
  };

  const isFiltered = Boolean(actionFilter || userFilter || searchTerm);

  const pageStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const pageEnd = Math.min(page * PAGE_SIZE, total);

  // The remaining three cards describe only the rows on screen, so they are
  // labelled accordingly. "Total Activities" uses the server-side total and
  // therefore spans every page.
  const totalActivities = total;

  const documentActivities = logs.filter(
    (log) => String(log.resourceType || "").toLowerCase() === "document"
  ).length;

  const caseActivities = logs.filter(
    (log) => String(log.resourceType || "").toLowerCase() === "case"
  ).length;

  const securityEvents = logs.filter(
    (log) => getStatus(log.action) === "Security"
  ).length;

  return (
    <div className="audit-page">
      <AppLayout>
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
              <span className="card-label">Documents · This Page</span>
            </div>

            <div className="summary-card">
              <span className="card-icon">&#128274;</span>
              <span className="card-value">{caseActivities}</span>
              <span className="card-label">Cases · This Page</span>
            </div>

            <div className="summary-card security-card">
              <span className="card-icon">&#9888;&#65039;</span>
              <span className="card-value">{securityEvents}</span>
              <span className="card-label">Security · This Page</span>
            </div>
          </div>

          <div className="toolbar">
            <input
              className="search-input"
              type="text"
              placeholder="Search actions, resources, IDs, or details..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>

          <div className="filter-bar">
            <div className="filter-field">
              <label htmlFor="action-filter">Action</label>

              <select
                id="action-filter"
                value={actionFilter}
                onChange={handleActionChange}
              >
                <option value={ALL_FILTER}>All Actions</option>
                {actionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {formatAction(option.value)} ({option.count})
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-field">
              <label htmlFor="user-filter">User</label>

              <select
                id="user-filter"
                value={userFilter}
                onChange={handleUserChange}
              >
                <option value={ALL_FILTER}>All Users</option>
                {userOptions.map((option) => {
                  const isSystem = option.userId == null;
                  const value = isSystem
                    ? SYSTEM_USER
                    : String(option.userId);

                  return (
                    <option key={value} value={value}>
                      {isSystem ? "System" : `User #${option.userId}`} (
                      {option.count})
                    </option>
                  );
                })}
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
            ) : logs.length > 0 ? (
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
                  {logs.map((log) => {
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
                  {isFiltered
                    ? "No matching audit records"
                    : "No audit records found"}
                </h3>
                <p className="empty-text">
                  {isFiltered
                    ? "No audit records match your current search or filters."
                    : "Audit records will appear here as activity occurs."}
                </p>
              </div>
            )}
          </div>

          <div className="pagination">
            <span className="pagination-info">
              {total === 0
                ? "No records"
                : `Showing ${pageStart}–${pageEnd} of ${total}`}
              {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ""}
            </span>

            <button
              className="pagination-button"
              type="button"
              onClick={handlePrevious}
              disabled={!canGoPrevious}
            >
              Previous
            </button>

            <button
              className="pagination-button"
              type="button"
              onClick={handleNext}
              disabled={!canGoNext}
            >
              Next
            </button>
          </div>

          <div className="security-notice">
            Audit logs are used for accountability, security monitoring, and
            investigation of suspicious activity.
          </div>

          <div className="ledger-section">
            <div className="ledger-header">
              <h2 className="ledger-title">Blockchain Audit Ledger</h2>
              <button
                className="ledger-verify-button"
                onClick={runLedgerVerification}
                disabled={ledgerLoading}
              >
                {ledgerLoading ? "Verifying..." : "Verify Ledger"}
              </button>
            </div>

            {ledgerError && (
              <div className="ledger-banner ledger-banner--error">
                {ledgerError}
              </div>
            )}

            {ledgerResult && (
              <div
                className={`ledger-banner ${
                  ledgerResult.valid ? "ledger-banner--valid" : "ledger-banner--invalid"
                }`}
              >
                <div className="ledger-banner-row">
                  <span className="ledger-banner-label">Status</span>
                  <span className="ledger-banner-value">
                    {ledgerResult.valid ? "Valid" : "INVALID"}
                  </span>
                </div>
                <div className="ledger-banner-row">
                  <span className="ledger-banner-label">Blocks</span>
                  <span className="ledger-banner-value">{ledgerResult.blocks}</span>
                </div>
                {ledgerResult.lastBlockIndex != null && (
                  <div className="ledger-banner-row">
                    <span className="ledger-banner-label">Last Block Index</span>
                    <span className="ledger-banner-value">{ledgerResult.lastBlockIndex}</span>
                  </div>
                )}
                {ledgerResult.message && (
                  <div className="ledger-banner-message">{ledgerResult.message}</div>
                )}
                {ledgerResult.failures &&
                  ledgerResult.failures.length > 0 &&
                  ledgerResult.failures.map((f, i) => (
                    <div key={i} className="ledger-banner-failure">
                      Block #{f.blockIndex}: {f.reason}
                    </div>
                  ))}
              </div>
            )}
          </div>
      </AppLayout>
    </div>
  );
}

export default AuditLogsPage;
