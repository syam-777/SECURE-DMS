import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./AdminAnalyticsPage.css";

const adminRoles = new Set(["ADMIN"]);

function resolveUserRole(user) {
  if (!user) {
    return "";
  }

  const candidates = [
    user.role,
    user.roleName,
    user.role_name,
    user.roleId,
    user.role_id,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim().toUpperCase();
    }
  }

  return "";
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function formatLabel(value) {
  if (value == null || value === "") {
    return "—";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function StatCard({ label, value }) {
  return (
    <div className="analytics-stat">
      <span className="analytics-stat-value">{value}</span>
      <span className="analytics-stat-label">{label}</span>
    </div>
  );
}

function BreakdownTable({ title, rows, total, valueKey }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  return (
    <div className="analytics-subsection">
      <h4 className="analytics-subtitle">{title}</h4>

      {safeRows.length > 0 ? (
        <table className="analytics-table">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Count</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {safeRows.map((row) => {
              const count = typeof row.count === "number" ? row.count : 0;
              const pct =
                typeof total === "number" && total > 0
                  ? Math.round((count / total) * 100)
                  : 0;

              return (
                <tr key={String(row[valueKey])}>
                  <td>{formatLabel(row[valueKey])}</td>
                  <td className="analytics-count">{count}</td>
                  <td className="analytics-share">
                    <div
                      className="analytics-bar"
                      role="img"
                      aria-label={`${pct} percent`}
                    >
                      <span
                        className="analytics-bar-fill"
                        style={{ width: pct + "%" }}
                      />
                    </div>
                    <span className="analytics-bar-value">{pct}%</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="analytics-empty">No data recorded yet.</p>
      )}
    </div>
  );
}

function CaseOverview({ cases }) {
  const data = cases || {};

  return (
    <section className="analytics-card" aria-labelledby="aa-cases-title">
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-cases-title">
          Case Overview
        </h3>
        <span className="analytics-total">
          {data.total ?? 0} total cases
        </span>
      </div>

      <div className="analytics-breakdowns">
        <BreakdownTable
          title="By Status"
          rows={data.byStatus}
          total={data.total}
          valueKey="status"
        />
        <BreakdownTable
          title="By Priority"
          rows={data.byPriority}
          total={data.total}
          valueKey="priority"
        />
        <BreakdownTable
          title="By Type"
          rows={data.byType}
          total={data.total}
          valueKey="type"
        />
      </div>
    </section>
  );
}

function DocumentOverview({ documents }) {
  const data = documents || {};

  return (
    <section className="analytics-card" aria-labelledby="aa-docs-title">
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-docs-title">
          Document Overview
        </h3>
        <span className="analytics-total">
          {data.total ?? 0} documents
        </span>
      </div>

      <div className="analytics-stat-row">
        <StatCard label="Documents" value={data.total ?? 0} />
        <StatCard label="Versions" value={data.versions ?? 0} />
      </div>

      <BreakdownTable
        title="By Type"
        rows={data.byType}
        total={data.total}
        valueKey="type"
      />
    </section>
  );
}

function UserOverview({ users }) {
  const data = users || {};

  return (
    <section className="analytics-card" aria-labelledby="aa-users-title">
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-users-title">
          User Overview
        </h3>
        <span className="analytics-total">{data.total ?? 0} users</span>
      </div>

      <BreakdownTable
        title="By Role"
        rows={data.byRole}
        total={data.total}
        valueKey="role"
      />
    </section>
  );
}

function ReviewOverview({ reviews }) {
  const data = reviews || {};

  return (
    <section className="analytics-card" aria-labelledby="aa-reviews-title">
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-reviews-title">
          Review Overview
        </h3>
        <span className="analytics-total">
          {data.total ?? 0} reviews
        </span>
      </div>

      <BreakdownTable
        title="By Decision"
        rows={data.byDecision}
        total={data.total}
        valueKey="decision"
      />
    </section>
  );
}

function IntegrityOverview({ integrity }) {
  const data = integrity || {};

  return (
    <section className="analytics-card" aria-labelledby="aa-integrity-title">
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-integrity-title">
          Document Integrity
        </h3>
      </div>

      <div className="analytics-stat-row">
        <StatCard label="Verified" value={data.verified ?? 0} />
        <StatCard label="Failed" value={data.failed ?? 0} />
        <StatCard label="Not Verified" value={data.notVerified ?? 0} />
      </div>
    </section>
  );
}

function AiOverview({ ai }) {
  const data = ai || {};

  return (
    <section className="analytics-card" aria-labelledby="aa-ai-title">
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-ai-title">
          AI Activity
        </h3>
      </div>

      <div className="analytics-stat-row">
        <StatCard label="Questions Asked" value={data.questions ?? 0} />
        <StatCard label="Summaries" value={data.summaries ?? 0} />
        <StatCard label="Classifications" value={data.classifications ?? 0} />
        <StatCard
          label="Entity Extractions"
          value={data.entityExtractions ?? 0}
        />
      </div>
    </section>
  );
}

function RecentActivity({ activity }) {
  const safeActivity = Array.isArray(activity) ? activity : [];

  return (
    <section
      className="analytics-card analytics-card--wide"
      aria-labelledby="aa-activity-title"
    >
      <div className="analytics-card-heading">
        <h3 className="analytics-card-title" id="aa-activity-title">
          Recent System Activity
        </h3>
      </div>

      {safeActivity.length > 0 ? (
        <ul className="analytics-activity">
          {safeActivity.map((event) => {
            const resource =
              event.resourceType
                ? `${formatLabel(event.resourceType)}${
                    event.resourceId != null
                      ? " #" + event.resourceId
                      : ""
                  }`
                : "System activity";

            return (
              <li className="analytics-activity-item" key={event.id}>
                <div className="analytics-activity-main">
                  <span className="analytics-activity-action">
                    {formatLabel(event.action)}
                  </span>
                </div>
                <div className="analytics-activity-meta">
                  {event.actor ? (
                    <span className="analytics-activity-actor">
                      {event.actor}
                    </span>
                  ) : null}
                  <span className="analytics-activity-resource">
                    {resource}
                  </span>
                  <span className="analytics-activity-time">
                    {formatDateTime(event.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="analytics-empty">
          No system activity recorded yet.
        </p>
      )}
    </section>
  );
}

function LoadingView() {
  return (
    <div
      className="analytics-skeleton-shelf"
      aria-busy="true"
      aria-label="Loading Admin Analytics"
    >
      <div className="analytics-skeleton analytics-skeleton-banner" />
      <div className="analytics-skeleton-grid">
        <div className="analytics-skeleton analytics-skeleton-card" />
        <div className="analytics-skeleton analytics-skeleton-card" />
        <div className="analytics-skeleton analytics-skeleton-card" />
        <div className="analytics-skeleton analytics-skeleton-card" />
      </div>
      <div className="analytics-skeleton analytics-skeleton-section" />
    </div>
  );
}

function NoAccessView() {
  return (
    <div className="analytics-notice">
      <h2>No Access</h2>
      <p>
        You do not have permission to view system analytics. Please contact
        a system administrator if you believe this is a mistake.
      </p>
      <Link className="analytics-inline-button" to="/dashboard">
        Back to Dashboard
      </Link>
    </div>
  );
}

function ErrorView({ message, onRetry }) {
  return (
    <div className="analytics-notice" role="alert">
      <h2>Unable to load Admin Analytics</h2>
      <p>{message}</p>
      <button className="analytics-inline-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function AdminAnalyticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState({ message: "", status: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const role = resolveUserRole(getCurrentUser());
  const isAdmin = adminRoles.has(role);

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    let cancelled = false;

    const loadAnalytics = async () => {
      try {
        const result = await apiFetch("/admin/analytics");

        if (cancelled) {
          return;
        }

        if (!result.success) {
          throw new Error(result.message || "Failed to load analytics");
        }

        setData(result);
        setError({ message: "", status: 0 });
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError({
          message: err.message || "Failed to load analytics",
          status: err.status || 0,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadAnalytics();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, reloadKey]);

  const handleRefresh = () => {
    setRefreshing(true);
    setReloadKey((key) => key + 1);
  };

  const handleRetry = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  let content;

  if (!isAdmin) {
    content = <NoAccessView />;
  } else if (loading) {
    content = <LoadingView />;
  } else if (error.status === 401 || error.status === 403) {
    content = <NoAccessView />;
  } else if (error.message) {
    content = <ErrorView message={error.message} onRetry={handleRetry} />;
  } else if (!data) {
    content = <ErrorView message="No data was returned." onRetry={handleRetry} />;
  } else {
    content = (
      <>
        <div className="analytics-grid">
          <CaseOverview cases={data.cases} />
          <DocumentOverview documents={data.documents} />
        </div>
        <div className="analytics-grid">
          <UserOverview users={data.users} />
          <ReviewOverview reviews={data.reviews} />
          <IntegrityOverview integrity={data.integrity} />
          <AiOverview ai={data.ai} />
        </div>
        <RecentActivity activity={data.activity} />
      </>
    );
  }

  return (
    <div className="admin-analytics-page">
      <AppLayout>
        <div className="analytics-heading">
          <div>
            <h1 className="analytics-page-title">Admin Analytics</h1>
            <p className="analytics-page-description">
              System-wide overview of cases, documents, users, reviews,
              integrity, AI activity, and recent system events.
            </p>
          </div>

          {isAdmin && (
            <button
              className="analytics-refresh-button"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              aria-label="Refresh admin analytics"
            >
              {loading || refreshing ? "Refreshing..." : "Refresh"}
            </button>
          )}
        </div>

        {content}
      </AppLayout>
    </div>
  );
}

export default AdminAnalyticsPage;