import { useState } from "react";
import { NavLink, Link, useParams } from "react-router-dom";
import "./CaseDetailsPage.css";

const allCases = {
  "CASE-1001": {
    id: "CASE-1001",
    title: "Cyber Fraud Investigation",
    type: "Cyber Crime",
    officer: "Sgt. A. Sharma",
    created: "2026-08-10",
    updated: "2026-09-02",
    status: "Active",
    description:
      "This case involves a series of sophisticated phishing attacks targeting customers of a regional banking institution. The threat actors used spoofed email domains and cloned login portals to harvest credentials, which were then used to initiate unauthorized wire transfers. Financial losses reported by victims exceed \u20B945 lakhs. Digital forensics on recovered devices indicate the use of offshore VPN infrastructure and encrypted communication channels. The investigation is currently focused on tracing the money flow and identifying accomplices within the network.",
  },
  "CASE-1002": {
    id: "CASE-1002",
    title: "Property Theft",
    type: "Theft",
    officer: "Insp. R. Verma",
    created: "2026-08-12",
    updated: "2026-08-30",
    status: "Pending",
    description:
      "A series of thefts reported at a residential complex in the downtown area. Suspects were captured on CCTV footage entering through an unsecured service entrance. Stolen items include electronics and jewelry valued at approximately \u20B93.5 lakhs. Investigation is pending collection of forensic evidence from the scene.",
  },
  "CASE-1003": {
    id: "CASE-1003",
    title: "Identity Theft Ring",
    type: "Cyber Crime",
    officer: "Sgt. A. Sharma",
    created: "2026-08-15",
    updated: "2026-09-01",
    status: "Active",
    description:
      "An organized identity theft operation targeting government employee databases. Compromised identities were used to open fraudulent bank accounts and apply for credit cards. Over 200 victims have been identified so far. Digital forensics are tracing the origin of the data breach to an insider threat.",
  },
  "CASE-1004": {
    id: "CASE-1004",
    title: "Vehicle Break-In",
    type: "Property",
    officer: "PO K. Nair",
    created: "2026-08-18",
    updated: "2026-08-22",
    status: "Closed",
    description:
      "Multiple vehicle break-ins reported in the parking structure of a commercial district. The suspect was identified through fingerprint analysis and has been apprehended. All stolen property has been recovered and returned to the owners.",
  },
  "CASE-1005": {
    id: "CASE-1005",
    title: "Bank Fraud Investigation",
    type: "Financial Crime",
    officer: "Insp. R. Verma",
    created: "2026-08-20",
    updated: "2026-09-03",
    status: "Active",
    description:
      "Internal investigation into unauthorized fund transfers from corporate accounts at a regional bank. Preliminary findings suggest exploitation of the bank's internal wire transfer system using compromised employee credentials. The total amount under investigation exceeds \u20B91.2 crore.",
  },
  "CASE-1006": {
    id: "CASE-1006",
    title: "Public Disturbance Report",
    type: "Public Order",
    officer: "PO K. Nair",
    created: "2026-08-25",
    updated: "2026-08-28",
    status: "Pending",
    description:
      "Report of repeated public disturbances in a residential neighborhood. Complaints include loud noise violations and property damage during late-night gatherings. Mediation with local residents is underway.",
  },
  "CASE-1007": {
    id: "CASE-1007",
    title: "Counterfeit Documents Seized",
    type: "Forgery",
    officer: "Sgt. A. Sharma",
    created: "2026-08-27",
    updated: "2026-08-31",
    status: "Closed",
    description:
      "A raid on a suspected forgery operation yielded counterfeit identity documents, forged stamps, and printing equipment. The suspect has been charged and the case has been forwarded to the prosecution.",
  },
  "CASE-1008": {
    id: "CASE-1008",
    title: "Digital Extortion Case",
    type: "Cyber Crime",
    officer: "Insp. R. Verma",
    created: "2026-08-30",
    updated: "2026-09-03",
    status: "Active",
    description:
      "A victim reported receiving threatening emails demanding payment in cryptocurrency in exchange for not releasing private information. The emails originated from encrypted email services. Investigation is tracing the payment wallet addresses and email metadata.",
  },
};

const caseDocuments = [
  {
    id: "DOC-0101",
    name: "FIR_Report_CASE1001.pdf",
    type: "PDF",
    uploadedBy: "Admin User",
    uploadedDate: "2026-08-10",
    version: "1.0",
    integrity: "Verified",
  },
  {
    id: "DOC-0102",
    name: "Forensic_Analysis_Report.pdf",
    type: "PDF",
    uploadedBy: "Sgt. A. Sharma",
    uploadedDate: "2026-08-25",
    version: "1.2",
    integrity: "Verified",
  },
  {
    id: "DOC-0103",
    name: "Victim_Statements.xlsx",
    type: "Spreadsheet",
    uploadedBy: "Sgt. A. Sharma",
    uploadedDate: "2026-08-18",
    version: "2.0",
    integrity: "Verified",
  },
  {
    id: "DOC-0104",
    name: "Evidence_Photos.zip",
    type: "Archive",
    uploadedBy: "PO K. Nair",
    uploadedDate: "2026-08-22",
    version: "1.0",
    integrity: "Protected",
  },
  {
    id: "DOC-0105",
    name: "Communication_Logs.xlsx",
    type: "Spreadsheet",
    uploadedBy: "Sgt. A. Sharma",
    uploadedDate: "2026-09-01",
    version: "1.1",
    integrity: "Verified",
  },
];

const versionHistory = [
  {
    version: 3,
    action: "Updated investigation findings",
    updatedBy: "Sgt. A. Sharma",
    date: "2026-09-02",
  },
  {
    version: 2,
    action: "Added forensic report and communication logs",
    updatedBy: "Sgt. A. Sharma",
    date: "2026-08-25",
  },
  {
    version: 1,
    action: "Initial case creation with FIR and preliminary evidence",
    updatedBy: "Admin User",
    date: "2026-08-10",
  },
];

const activityHistory = [
  {
    id: 1,
    action: "Case created",
    user: "Admin User",
    date: "2026-08-10 09:15 AM",
    details: "New case CASE-1001 registered in the system.",
  },
  {
    id: 2,
    action: "Officer assigned",
    user: "Admin User",
    date: "2026-08-10 09:20 AM",
    details: "Sgt. A. Sharma assigned as lead investigator.",
  },
  {
    id: 3,
    action: "Document uploaded",
    user: "Admin User",
    date: "2026-08-10 09:45 AM",
    details: "FIR_Report_CASE1001.pdf uploaded.",
  },
  {
    id: 4,
    action: "Document uploaded",
    user: "Sgt. A. Sharma",
    date: "2026-08-18 02:30 PM",
    details: "Victim_Statements.xlsx uploaded.",
  },
  {
    id: 5,
    action: "Case updated",
    user: "Sgt. A. Sharma",
    date: "2026-08-25 11:00 AM",
    details: "Investigation findings updated. Forensic report added.",
  },
  {
    id: 6,
    action: "Document viewed",
    user: "Insp. R. Verma",
    date: "2026-08-28 04:15 PM",
    details: "Forensic_Analysis_Report.pdf accessed.",
  },
  {
    id: 7,
    action: "Case updated",
    user: "Sgt. A. Sharma",
    date: "2026-09-02 10:40 AM",
    details: "Investigation findings updated with new communication logs.",
  },
];

function CaseDetailsPage() {
  const { caseId } = useParams();
  const [activeTab, setActiveTab] = useState("documents");
  const caseData = allCases[caseId];

  if (!caseData) {
    return (
      <div className="case-details-page">
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
            <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/dashboard">Dashboard</NavLink>
            <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/cases">Cases</NavLink>
            <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/documents">Documents</NavLink>
            <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/ai-assistant">AI Assistant</NavLink>
            <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/search">Search</NavLink>
            <NavLink className={({ isActive }) => "sidebar-item" + (isActive ? " active" : "")} to="/audit-logs">Audit Logs</NavLink>
          </aside>
          <main className="main-content">
            <div className="page-heading">
              <div className="page-heading-row">
                <div>
                  <h1 className="page-title">Case Not Found</h1>
                  <p className="page-description">
                    No case found with ID <strong>{caseId}</strong>.
                  </p>
                </div>
                <Link to="/cases" className="back-button">
                  &#8592; Back to Cases
                </Link>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="case-details-page">
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
            <div className="page-heading-row">
              <div>
                <h1 className="page-title">Case Details</h1>
                <p className="page-description">
                  Viewing details for case {caseData.id}.
                </p>
              </div>
              <Link to="/cases" className="back-button">
                &#8592; Back to Cases
              </Link>
            </div>
          </div>

          <div className="case-info-card">
            <div className="case-info-header">
              <h2 className="case-info-title">{caseData.title}</h2>
              <span
                className={`status-badge status-${caseData.status.toLowerCase()}`}
              >
                {caseData.status}
              </span>
            </div>
            <div className="case-info-grid">
              <div className="case-info-field">
                <span className="case-info-label">Case ID</span>
                <span className="case-info-value case-id-highlight">
                  {caseData.id}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Case Type</span>
                <span className="case-info-value">{caseData.type}</span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Assigned Officer</span>
                <span className="case-info-value">{caseData.officer}</span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Created Date</span>
                <span className="case-info-value">{caseData.created}</span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Last Updated</span>
                <span className="case-info-value">{caseData.updated}</span>
              </div>
            </div>
          </div>

          <div className="case-description-section">
            <h3 className="section-title">Case Description</h3>
            <p className="description-text">{caseData.description}</p>
          </div>

          <div className="case-tabs">
            <button
              className={`case-tab ${activeTab === "documents" ? "active" : ""}`}
              onClick={() => setActiveTab("documents")}
            >
              Documents ({caseDocuments.length})
            </button>
            <button
              className={`case-tab ${activeTab === "versions" ? "active" : ""}`}
              onClick={() => setActiveTab("versions")}
            >
              Version History
            </button>
            <button
              className={`case-tab ${activeTab === "activity" ? "active" : ""}`}
              onClick={() => setActiveTab("activity")}
            >
              Activity History
            </button>
          </div>

          {activeTab === "documents" && (
            <div className="table-section">
              <table className="case-documents-table">
                <thead>
                  <tr>
                    <th>Document ID</th>
                    <th>Document Name</th>
                    <th>Document Type</th>
                    <th>Uploaded By</th>
                    <th>Uploaded Date</th>
                    <th>Version</th>
                    <th>Integrity Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {caseDocuments.map((doc) => (
                    <tr key={doc.id}>
                      <td className="doc-id">{doc.id}</td>
                      <td>{doc.name}</td>
                      <td>{doc.type}</td>
                      <td>{doc.uploadedBy}</td>
                      <td>{doc.uploadedDate}</td>
                      <td>{doc.version}</td>
                      <td>
                        <span
                          className={`integrity-badge integrity-${doc.integrity.toLowerCase()}`}
                        >
                          {doc.integrity === "Verified" ? "&#10003; " : ""}
                          {doc.integrity}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            className="view-button"
                            onClick={() =>
                              alert(
                                `Viewing document ${doc.id} - ${doc.name}`
                              )
                            }
                          >
                            View
                          </button>
                          <button
                            className="download-button"
                            onClick={() =>
                              alert(
                                `Downloading document ${doc.id} - ${doc.name}`
                              )
                            }
                          >
                            Download
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === "versions" && (
            <div className="version-section">
              <div className="version-notice">
                <span className="version-notice-icon">&#128274;</span>
                <span>
                  All previous versions are permanently retained. Updates create
                  new versions instead of overwriting existing records.
                </span>
              </div>
              <div className="version-timeline">
                {versionHistory.map((entry, index) => (
                  <div className="version-entry" key={entry.version}>
                    <div className="version-marker">
                      <div
                        className={`version-dot ${index === 0 ? "latest" : ""}`}
                      />
                      {index < versionHistory.length - 1 && (
                        <div className="version-line" />
                      )}
                    </div>
                    <div className="version-content">
                      <div className="version-header">
                        <span className="version-number">
                          Version {entry.version}
                        </span>
                        {index === 0 && (
                          <span className="version-latest-badge">Latest</span>
                        )}
                      </div>
                      <p className="version-action">{entry.action}</p>
                      <div className="version-meta">
                        <span>{entry.updatedBy}</span>
                        <span className="version-separator">&#183;</span>
                        <span>{entry.date}</span>
                      </div>
                      <div className="version-actions">
                        <button
                          className="version-action-button"
                          onClick={() =>
                            alert(
                              `Comparing Version ${entry.version} with previous version`
                            )
                          }
                        >
                          Compare Versions
                        </button>
                        {index > 0 && (
                          <button
                            className="version-action-button rollback"
                            onClick={() =>
                              alert(
                                `Rollback to Version ${entry.version} requested`
                              )
                            }
                          >
                            Rollback
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="activity-section">
              <div className="activity-list">
                {activityHistory.map((item) => (
                  <div className="activity-entry" key={item.id}>
                    <div className="activity-icon">
                      {item.action === "Case created" && <span>&#128196;</span>}
                      {item.action === "Officer assigned" && (
                        <span>&#128100;</span>
                      )}
                      {item.action === "Document uploaded" && (
                        <span>&#128228;</span>
                      )}
                      {item.action === "Case updated" && (
                        <span>&#9998;</span>
                      )}
                      {item.action === "Document viewed" && (
                        <span>&#128065;</span>
                      )}
                    </div>
                    <div className="activity-content">
                      <div className="activity-header">
                        <span
                          className={`action-badge action-${item.action.toLowerCase().replace(/\s+/g, "-")}`}
                        >
                          {item.action}
                        </span>
                        <span className="activity-date">{item.date}</span>
                      </div>
                      <p className="activity-details">{item.details}</p>
                      <span className="activity-user">by {item.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="security-notice">
            <span className="security-notice-icon">&#128737;</span>
            <div>
              <strong>Security Notice</strong>
              <p>
                All case activity and document changes are recorded for
                auditability. Previous document versions are permanently retained
                and cannot be deleted. Version rollback operations are logged and
                require authorization. This ensures a complete, tamper-evident
                chain of custody for all case materials.
              </p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default CaseDetailsPage;
