import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./SecurityCenterPage.css";

const selectableRoles = ["USER", "REVIEWER", "ADMIN"];

const roleNameById = {
  1: "ADMIN",
  2: "OFFICER",
  3: "REVIEWER",
  4: "USER",
};

function resolveUserRole(user) {
  if (!user) {
    return "USER";
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
      const normalized = candidate.trim().toUpperCase();
      if (selectableRoles.includes(normalized)) {
        return normalized;
      }
      const byId = roleNameById[Number(candidate)];
      if (byId) {
        return byId;
      }
      return normalized;
    }
  }

  for (const candidate of candidates) {
    if (Number.isInteger(candidate)) {
      const byId = roleNameById[candidate];
      if (byId) {
        return byId;
      }
    }
  }

  return "USER";
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function formatLabel(value) {
  if (!value) {
    return value ?? "—";
  }
  return String(value)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusBanner({ ledger, documents, signatures }) {
  const ledgerValid = ledger && ledger.valid === true;
  const integrityFailed = (documents && documents.integrity && documents.integrity.failed) || 0;
  const signatureInvalid = (signatures && signatures.invalid) || 0;

  const hasIssues = !ledgerValid || integrityFailed > 0 || signatureInvalid > 0;

  return (
    <section
      className={
        "status-banner" +
        (hasIssues ? " status-banner--danger" : " status-banner--success")
      }
      role="status"
      aria-live="polite"
    >
      <h2 className="status-banner-title">
        {hasIssues
          ? "Attention required"
          : "Security systems operational"}
      </h2>
      <p className="status-banner-detail">
        {hasIssues
          ? "One or more security systems are reporting a problem. Review the sections below."
          : "Ledger, document integrity, and approval signatures are all reporting normally."}
      </p>
      <div className="status-breakdown">
        <span
          className={
            "status-chip" + (ledgerValid ? " status-chip--ok" : " status-chip--bad")
          }
        >
          Blockchain Ledger: {ledgerValid ? "VALID" : "INVALID"}
        </span>
        <span
          className={
            "status-chip" +
            (integrityFailed > 0 ? " status-chip--bad" : " status-chip--ok")
          }
        >
          Document Integrity:{" "}
          {integrityFailed > 0 ? `${integrityFailed} FAILED` : "OK"}
        </span>
        <span
          className={
            "status-chip" +
            (signatureInvalid > 0 ? " status-chip--bad" : " status-chip--ok")
          }
        >
          Approval Signatures:{" "}
          {signatureInvalid > 0 ? `${signatureInvalid} INVALID` : "OK"}
        </span>
      </div>
    </section>
  );
}

function UserCard({ users }) {
  const userCounts = users || {};
  const byRole = userCounts.byRole || [];

  return (
    <section className="summary-card" aria-labelledby="sec-users-title">
      <h3 className="card-title" id="sec-users-title">
        User Accounts
      </h3>
      <span className="card-value">{userCounts.total ?? 0}</span>
      <span className="card-label">total registered users</span>
      <div className="breakdown">
        <div className="breakdown-row">
          <span className="breakdown-label">Active</span>
          <span className="breakdown-value">{userCounts.active ?? 0}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Inactive</span>
          <span className="breakdown-value">{userCounts.inactive ?? 0}</span>
        </div>
        {byRole.length > 0 ? (
          byRole.map((row) => (
            <div className="breakdown-row" key={row.role}>
              <span className="breakdown-label">{formatLabel(row.role)}</span>
              <span className="breakdown-value">{row.count}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p className="empty-text">No roles assigned yet.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function VerificationCard({ officerVerifications }) {
  const counts = officerVerifications || {};

  return (
    <section className="summary-card" aria-labelledby="sec-verif-title">
      <h3 className="card-title" id="sec-verif-title">
        Officer Verifications
      </h3>
      <div className="breakdown">
        <div className="breakdown-row">
          <span className="breakdown-label">Pending</span>
          <span className="breakdown-badge breakdown-badge--warning">
            {counts.pending ?? 0}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Approved</span>
          <span className="breakdown-badge breakdown-badge--valid">
            {counts.approved ?? 0}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Rejected</span>
          <span className="breakdown-badge breakdown-badge--invalid">
            {counts.rejected ?? 0}
          </span>
        </div>
      </div>
    </section>
  );
}

function IntegrityCard({ documents }) {
  const docCounts = documents || {};
  const integrity = docCounts.integrity || {};
  const failed = integrity.failed || 0;
  const hasFailures = failed > 0;

  return (
    <section
      className={
        "summary-card" + (hasFailures ? " summary-card--danger" : "")
      }
      aria-labelledby="sec-integrity-title"
    >
      <h3 className="card-title" id="sec-integrity-title">
        Document Integrity
      </h3>
      <div className="breakdown">
        <div className="breakdown-row">
          <span className="breakdown-label">Documents</span>
          <span className="breakdown-value">{docCounts.total ?? 0}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Versions</span>
          <span className="breakdown-value">{docCounts.versions ?? 0}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Verified</span>
          <span className="breakdown-badge breakdown-badge--valid">
            {integrity.verified ?? 0}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Failed</span>
          <span className="breakdown-badge breakdown-badge--invalid">
            {failed}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Not Verified</span>
          <span className="breakdown-badge breakdown-badge--warning">
            {integrity.notVerified ?? 0}
          </span>
        </div>
      </div>
      {hasFailures && (
        <p className="status-banner-detail">
          At least one document version failed its integrity check.
        </p>
      )}
    </section>
  );
}

function SignatureCard({ signatures }) {
  const counts = signatures || {};
  const invalid = counts.invalid || 0;
  const hasInvalid = invalid > 0;

  return (
    <section
      className={
        "summary-card" + (hasInvalid ? " summary-card--danger" : "")
      }
      aria-labelledby="sec-signature-title"
    >
      <h3 className="card-title" id="sec-signature-title">
        Digital Approval Signatures
      </h3>
      <div className="breakdown">
        <div className="breakdown-row">
          <span className="breakdown-label">Signed</span>
          <span className="breakdown-value">{counts.signed ?? 0}</span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Valid</span>
          <span className="breakdown-badge breakdown-badge--valid">
            {counts.valid ?? 0}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Invalid</span>
          <span className="breakdown-badge breakdown-badge--invalid">
            {invalid}
          </span>
        </div>
        <div className="breakdown-row">
          <span className="breakdown-label">Unsigned</span>
          <span className="breakdown-badge breakdown-badge--warning">
            {counts.unsigned ?? 0}
          </span>
        </div>
      </div>
      {hasInvalid && (
        <p className="status-banner-detail">
          At least one stored approval signature failed verification.
        </p>
      )}
    </section>
  );
}

function LedgerCard({ ledger }) {
  const ledgerData = ledger || {};
  const valid = ledgerData.valid === true;
  const lastBlockIndex =
    ledgerData.lastBlockIndex == null ? "—" : String(ledgerData.lastBlockIndex);

  return (
    <section
      className={
        "summary-card" + (valid ? " summary-card--valid" : " summary-card--danger")
      }
      aria-labelledby="sec-ledger-title"
    >
      <h3 className="card-title" id="sec-ledger-title">
        Blockchain Audit Ledger
      </h3>
      <span
        className={"status-badge " + (valid ? "status-valid" : "status-invalid")}
      >
        {valid ? "VALID" : "INVALID"}
      </span>
      <div
        className={
          "ledger-banner ledger-banner--" + (valid ? "valid" : "invalid")
        }
      >
        <div className="ledger-banner-row">
          <span className="ledger-banner-label">Blocks</span>
          <span className="ledger-banner-value">{ledgerData.blocks ?? 0}</span>
        </div>
        <div className="ledger-banner-row">
          <span className="ledger-banner-label">Last Block Index</span>
          <span className="ledger-banner-value">{lastBlockIndex}</span>
        </div>
      </div>
      <p className="status-banner-detail">{ledgerData.message || ""}</p>
    </section>
  );
}

function NotificationCard({ notifications }) {
  const byType = (notifications && notifications.byType) || [];

  return (
    <section className="summary-card" aria-labelledby="sec-notif-title">
      <h3 className="card-title" id="sec-notif-title">
        Notification Activity
      </h3>
      {byType.length > 0 ? (
        <div className="breakdown">
          {byType.map((row) => (
            <div className="breakdown-row" key={row.type}>
              <span className="breakdown-label">{formatLabel(row.type)}</span>
              <span className="breakdown-value">{row.count}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-text">No notifications have been generated.</p>
        </div>
      )}
    </section>
  );
}

function AuditSection({ audit }) {
  const auditData = audit || {};
  const events = auditData.securityEvents || [];

  return (
    <section className="section-card" aria-labelledby="sec-audit-title">
      <h3 className="section-title" id="sec-audit-title">
        Audit Activity
      </h3>
      <p className="section-subtitle">
        <span className="audit-total">
          <span className="audit-total-value">{auditData.totalEvents ?? 0}</span>{" "}
          total audit events tracked. Breakdown of security-relevant event
          types below.
        </span>
      </p>
      <table className="audit-table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Count</th>
          </tr>
        </thead>
        <tbody>
          {events.map((row) => (
            <tr key={row.action}>
              <td>{formatLabel(row.action)}</td>
              <td className="count-cell">{row.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LoadingView() {
  return (
    <div className="skeleton-shelf" aria-busy="true" aria-label="Loading Security Center">
      <div className="skeleton skeleton-banner" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
      <div className="skeleton skeleton-section" />
    </div>
  );
}

function NoAccessView() {
  return (
    <div className="notice-card">
      <h2>No Access</h2>
      <p>
        You do not have permission to view the Security Center. Please contact
        a system administrator if you believe this is a mistake.
      </p>
      <Link className="inline-button" to="/dashboard">
        Back to Dashboard
      </Link>
    </div>
  );
}

function ErrorView({ message, onRetry }) {
  return (
    <div className="notice-card" role="alert">
      <h2>Unable to load Security Center</h2>
      <p>{message}</p>
      <button className="inline-button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function SecurityCenterPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState({ message: "", status: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const role = resolveUserRole(getCurrentUser());

  useEffect(() => {
    if (role !== "ADMIN") {
      return;
    }

    let cancelled = false;

    const loadOverview = async () => {
      try {
        const result = await apiFetch("/security/overview");

        if (cancelled) {
          return;
        }

        if (!result.success) {
          throw new Error(result.message || "Failed to load Security Center");
        }

        setData(result);
        setError({ message: "", status: 0 });
      } catch (err) {
        if (cancelled) {
          return;
        }
        setError({
          message: err.message || "Failed to load Security Center",
          status: err.status || 0,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    loadOverview();

    return () => {
      cancelled = true;
    };
  }, [role, reloadKey]);

  const handleRefresh = () => {
    setRefreshing(true);
    setReloadKey((key) => key + 1);
  };

  const handleRetry = () => {
    setLoading(true);
    setReloadKey((key) => key + 1);
  };

  let content;

  if (role !== "ADMIN") {
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
        <StatusBanner
          ledger={data.ledger}
          documents={data.documents}
          signatures={data.signatures}
        />
        <div className="summary-cards">
          <UserCard users={data.users} />
          <VerificationCard officerVerifications={data.officerVerifications} />
          <IntegrityCard documents={data.documents} />
          <SignatureCard signatures={data.signatures} />
          <LedgerCard ledger={data.ledger} />
          <NotificationCard notifications={data.notifications} />
        </div>
        <AuditSection audit={data.audit} />
      </>
    );
  }

  return (
    <div className="security-page">
      <AppLayout>
        <div className="page-heading">
          <div>
            <h1 className="page-title">Security Center</h1>
            <p className="page-description">
              Monitor system security, integrity, approvals, audit activity,
              and security events.
            </p>
          </div>
          {role === "ADMIN" && (
            <button
              className="refresh-button"
              onClick={handleRefresh}
              disabled={loading || refreshing}
              aria-label="Refresh security overview"
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

export default SecurityCenterPage;