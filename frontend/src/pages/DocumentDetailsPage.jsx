import { useState } from "react";
import { NavLink, Link } from "react-router-dom";
import "./DocumentDetailsPage.css";

const documentData = {
  id: "DOC-5001",
  name: "FIR_Report_CASE1001.pdf",
  type: "FIR Report",
  caseId: "CASE-1001",
  uploadedBy: "Sgt. A. Sharma",
  uploaded: "2026-08-12",
  updated: "2026-09-02",
  status: "Verified",
  description:
    "The First Information Report filed for the Cyber Fraud Investigation case CASE-1001. This document records the initial complaint registered by the affected parties, including the nature of the alleged offense, the financial losses reported, and the preliminary information collected at the time of registration.",
};

const integrityData = {
  status: "Verified",
  hash: "SAMPLE_FAKE_HASH_0a1b2c3d4e5f6789abcdef0123456789abcdef0123456789abcdef012345678",
  lastVerified: "2026-09-02",
};

const documentVersions = [
  {
    version: 3,
    updatedBy: "Sgt. A. Sharma",
    date: "2026-09-02",
    action:
      "Updated the document metadata with additional investigation findings.",
    integrity: "Verified",
  },
  {
    version: 2,
    updatedBy: "Sgt. A. Sharma",
    date: "2026-08-25",
    action:
      "Added supplementary sections covering witness statements and new evidence.",
    integrity: "Verified",
  },
  {
    version: 1,
    updatedBy: "Admin User",
    date: "2026-08-12",
    action: "Initial upload of the FIR report for case CASE-1001.",
    integrity: "Verified",
  },
];

const activityHistory = [
  {
    action: "Document uploaded",
    user: "Sgt. A. Sharma",
    date: "2026-08-12 10:15 AM",
  },
  {
    action: "Document verified",
    user: "System",
    date: "2026-08-12 10:16 AM",
  },
  {
    action: "Document viewed",
    user: "Insp. R. Verma",
    date: "2026-08-20 03:45 PM",
  },
  {
    action: "New version created",
    user: "Sgt. A. Sharma",
    date: "2026-08-25 11:30 AM",
  },
  {
    action: "Document viewed",
    user: "Admin User",
    date: "2026-09-01 09:05 AM",
  },
  {
    action: "New version created",
    user: "Sgt. A. Sharma",
    date: "2026-09-02 10:40 AM",
  },
];

function DocumentDetailsPage() {
  const [activeTab, setActiveTab] = useState("versions");
  const [selectedVersion, setSelectedVersion] = useState(3);

  const displayHash =
    integrityData.hash.slice(0, 12) + "..." + integrityData.hash.slice(-12);

  return (
    <div className="document-details-page">
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
                <h1 className="page-title">Document Details</h1>
                <p className="page-description">
                  Viewing details for document {documentData.id}.
                </p>
              </div>
              <Link to="/documents" className="back-button">
                &#8592; Back to Documents
              </Link>
            </div>
          </div>

          <div className="doc-info-card">
            <div className="doc-info-header">
              <h2 className="doc-info-title">{documentData.name}</h2>
              <span
                className={`status-badge status-${documentData.status.toLowerCase()}`}
              >
                {documentData.status}
              </span>
            </div>
            <div className="doc-info-grid">
              <div className="doc-info-field">
                <span className="doc-info-label">Document ID</span>
                <span className="doc-info-value doc-id-highlight">
                  {documentData.id}
                </span>
              </div>
              <div className="doc-info-field">
                <span className="doc-info-label">Document Type</span>
                <span className="doc-info-value">{documentData.type}</span>
              </div>
              <div className="doc-info-field">
                <span className="doc-info-label">Case ID</span>
                <span className="doc-info-value doc-id-highlight">
                  {documentData.caseId}
                </span>
              </div>
              <div className="doc-info-field">
                <span className="doc-info-label">Uploaded By</span>
                <span className="doc-info-value">{documentData.uploadedBy}</span>
              </div>
              <div className="doc-info-field">
                <span className="doc-info-label">Uploaded Date</span>
                <span className="doc-info-value">{documentData.uploaded}</span>
              </div>
              <div className="doc-info-field">
                <span className="doc-info-label">Last Updated</span>
                <span className="doc-info-value">{documentData.updated}</span>
              </div>
            </div>
          </div>

          <div className="doc-description-section">
            <h3 className="section-title">Description</h3>
            <p className="description-text">{documentData.description}</p>
          </div>

          <div className="integrity-card">
            <div className="integrity-card-header">
              <span className="integrity-card-icon">&#128737;</span>
              <h3 className="integrity-card-title">Security / Integrity</h3>
            </div>
            <div className="integrity-grid">
              <div className="integrity-field">
                <span className="integrity-label">Integrity Status</span>
                <span className="integrity-value">
                  <span className="integrity-badge integrity-verified">
                    &#10003; {integrityData.status}
                  </span>
                </span>
              </div>
              <div className="integrity-field">
                <span className="integrity-label">SHA-256 Hash</span>
                <span className="integrity-value integrity-hash">
                  {displayHash}
                </span>
              </div>
              <div className="integrity-field">
                <span className="integrity-label">Last Verified</span>
                <span className="integrity-value">
                  {integrityData.lastVerified}
                </span>
              </div>
            </div>
            <p className="integrity-note">
              The SHA-256 value shown above is a frontend placeholder for
              demonstration purposes only. Real cryptographic hash verification
              will be performed and validated by the backend during document
              storage and integrity checks.
            </p>
          </div>

          <div className="section-tabs">
            <button
              className={`section-tab ${activeTab === "versions" ? "active" : ""}`}
              onClick={() => setActiveTab("versions")}
            >
              Version History
            </button>
            <button
              className={`section-tab ${activeTab === "activity" ? "active" : ""}`}
              onClick={() => setActiveTab("activity")}
            >
              Activity History
            </button>
          </div>

          {activeTab === "versions" && (
            <div className="version-section">
              <div className="version-notice">
                <span className="version-notice-icon">&#128274;</span>
                <span>
                  Previous versions are retained and cannot be silently
                  overwritten. Each version has its own integrity record.
                </span>
              </div>
              <div className="version-layout">
                <div className="version-timeline">
                  {documentVersions.map((entry, index) => (
                    <div
                      className={`version-entry ${selectedVersion === entry.version ? "selected" : ""}`}
                      key={entry.version}
                      onClick={() => setSelectedVersion(entry.version)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          setSelectedVersion(entry.version);
                        }
                      }}
                    >
                      <div className="version-marker">
                        <div
                          className={`version-dot ${index === 0 ? "latest" : ""}`}
                        />
                        {index < documentVersions.length - 1 && (
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
                      </div>
                    </div>
                  ))}
                </div>
                <div className="version-details-panel">
                  {(() => {
                    const entry = documentVersions.find(
                      (v) => v.version === selectedVersion
                    );
                    if (!entry) return null;
                    const isLatest = entry.version === documentVersions[0].version;
                    return (
                      <>
                        <div className="version-details-header">
                          <h3 className="version-details-title">
                            Version {entry.version} Details
                          </h3>
                          {isLatest && (
                            <span className="version-latest-badge">Current</span>
                          )}
                        </div>
                        <div className="version-details-grid">
                          <div className="version-detail-field">
                            <span className="version-detail-label">
                              Updated By
                            </span>
                            <span className="version-detail-value">
                              {entry.updatedBy}
                            </span>
                          </div>
                          <div className="version-detail-field">
                            <span className="version-detail-label">Date</span>
                            <span className="version-detail-value">
                              {entry.date}
                            </span>
                          </div>
                          <div className="version-detail-field">
                            <span className="version-detail-label">
                              Change Description
                            </span>
                            <span className="version-detail-value">
                              {entry.action}
                            </span>
                          </div>
                          <div className="version-detail-field">
                            <span className="version-detail-label">
                              Integrity Status
                            </span>
                            <span
                              className={`integrity-badge integrity-${entry.integrity.toLowerCase()}`}
                            >
                              &#10003; {entry.integrity}
                            </span>
                          </div>
                          <div className="version-detail-field">
                            <span className="version-detail-label">
                              Current Version
                            </span>
                            <span className="version-detail-value">
                              {isLatest ? "Yes" : "No"}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {activeTab === "activity" && (
            <div className="activity-section">
              <div className="activity-list">
                {activityHistory.map((item, index) => (
                  <div className="activity-entry" key={index}>
                    <div className="activity-icon">
                      {item.action === "Document uploaded" && (
                        <span>&#128228;</span>
                      )}
                      {item.action === "Document verified" && (
                        <span>&#10003;</span>
                      )}
                      {item.action === "New version created" && (
                        <span>&#9998;</span>
                      )}
                      {item.action === "Document viewed" && (
                        <span>&#128065;</span>
                      )}
                    </div>
                    <div className="activity-content">
                      <div className="activity-header">
                        <span className="action-badge">{item.action}</span>
                        <span className="activity-date">{item.date}</span>
                      </div>
                      <span className="activity-user">by {item.user}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default DocumentDetailsPage;
