import { useState } from "react";
import "./AuditLogsPage.css";

const initialLogs = [
  { id: 1, timestamp: "2026-09-03 10:24", user: "Admin User", action: "Case Created", resource: "Case", caseId: "CASE-1001", details: "Created new case CASE-1001", status: "Success" },
  { id: 2, timestamp: "2026-09-03 09:12", user: "Sgt. A. Sharma", action: "Document Uploaded", resource: "FIR_Report_CASE1001.pdf", caseId: "CASE-1001", details: "Uploaded FIR report", status: "Success" },
  { id: 3, timestamp: "2026-09-02 17:45", user: "Sgt. A. Sharma", action: "Document Viewed", resource: "FIR_Report_CASE1001.pdf", caseId: "CASE-1001", details: "Viewed document", status: "Success" },
  { id: 4, timestamp: "2026-09-02 16:30", user: "Sgt. A. Sharma", action: "Document Updated", resource: "FIR_Report_CASE1001.pdf", caseId: "CASE-1001", details: "Updated document metadata", status: "Success" },
  { id: 5, timestamp: "2026-09-02 14:05", user: "Admin User", action: "Case Assigned", resource: "Case", caseId: "CASE-1001", details: "Assigned officer to case", status: "Success" },
  { id: 6, timestamp: "2026-09-02 11:20", user: "Insp. R. Verma", action: "Document Uploaded", resource: "Witness_Statement_CASE1003.pdf", caseId: "CASE-1003", details: "Uploaded a witness statement", status: "Success" },
  { id: 7, timestamp: "2026-09-01 15:48", user: "Admin User", action: "Role Changed", resource: "User", caseId: "—", details: "Changed a user's role", status: "Security" },
  { id: 8, timestamp: "2026-09-01 10:10", user: "Admin User", action: "Login", resource: "Session", caseId: "—", details: "Successful login", status: "Success" },
  { id: 9, timestamp: "2026-08-31 18:22", user: "PO K. Nair", action: "Document Downloaded", resource: "Charge_Sheet_CASE1004.pdf", caseId: "CASE-1004", details: "Downloaded charge sheet", status: "Success" },
  { id: 10, timestamp: "2026-08-31 09:55", user: "Admin User", action: "Logout", resource: "Session", caseId: "—", details: "Successful logout", status: "Success" },
  { id: 11, timestamp: "2026-08-30 13:37", user: "Insp. R. Verma", action: "Case Updated", resource: "Case", caseId: "CASE-1005", details: "Updated case status to Active", status: "Success" },
  { id: 12, timestamp: "2026-08-30 08:15", user: "Sgt. A. Sharma", action: "Document Viewed", resource: "Forensic_Report_CASE1001.pdf", caseId: "CASE-1001", details: "Viewed forensic report", status: "Success" },
];

const actionOptions = [
  "All Actions",
  "Login",
  "Logout",
  "Case Created",
  "Case Updated",
  "Document Uploaded",
  "Document Viewed",
  "Document Updated",
  "Document Downloaded",
  "Case Assigned",
  "Role Changed",
];

const userOptions = ["All Users", "Admin User", "Sgt. A. Sharma", "Insp. R. Verma", "PO K. Nair"];

function AuditLogsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [actionFilter, setActionFilter] = useState("All Actions");
  const [userFilter, setUserFilter] = useState("All Users");

  const filteredLogs = initialLogs.filter((log) => {
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      log.user.toLowerCase().includes(term) ||
      log.action.toLowerCase().includes(term) ||
      log.resource.toLowerCase().includes(term) ||
      log.caseId.toLowerCase().includes(term);

    const matchesAction = actionFilter === "All Actions" || log.action === actionFilter;
    const matchesUser = userFilter === "All Users" || log.user === userFilter;

    return matchesSearch && matchesAction && matchesUser;
  });

  const totalActivities = initialLogs.length;
  const documentActivities = initialLogs.filter((log) => log.action.startsWith("Document")).length;
  const caseActivities = initialLogs.filter(
    (log) => log.action.startsWith("Case") && log.caseId !== "—"
  ).length;
  const securityEvents = initialLogs.filter((log) => log.status === "Security").length;

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
            <span className="user-name">Admin User</span>
          </div>
          <button className="logout-button">Logout</button>
        </div>
      </nav>

      <div className="dashboard-body">
        <aside className="sidebar">
          <a className="sidebar-item" href="#dashboard">Dashboard</a>
          <a className="sidebar-item" href="#cases">Cases</a>
          <a className="sidebar-item" href="#documents">Documents</a>
          <a className="sidebar-item" href="#ai">AI Assistant</a>
          <a className="sidebar-item" href="#search">Search</a>
          <a className="sidebar-item active" href="#audit">Audit Logs</a>
        </aside>

        <main className="main-content">
          <div className="page-heading">
            <h1 className="page-title">Audit Logs</h1>
            <p className="page-description">
              Track and review important activities performed within Secure DMS.
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
              placeholder="Search by user, action, resource, or case ID..."
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
                  <option key={action} value={action}>{action}</option>
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
                  <option key={user} value={user}>{user}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-section">
            {filteredLogs.length > 0 ? (
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Case ID</th>
                    <th>Details</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="timestamp">{log.timestamp}</td>
                      <td>{log.user}</td>
                      <td>
                        <span className={`action-badge action-${log.action.toLowerCase().replace(/ /g, "-")}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="resource">{log.resource}</td>
                      <td className="case-id">{log.caseId}</td>
                      <td className="details">{log.details}</td>
                      <td>
                        <span className={`status-badge status-${log.status.toLowerCase()}`}>
                          {log.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">&#128269;</span>
                <h3 className="empty-title">No audit records found</h3>
                <p className="empty-text">
                  No audit records match your current search or filters. Try
                  adjusting your search terms or clearing the filters.
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
