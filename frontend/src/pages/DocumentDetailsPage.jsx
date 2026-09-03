import { useState, useEffect, useCallback } from "react";
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
  const [showPreview, setShowPreview] = useState(false);

  const closePreview = useCallback(() => setShowPreview(false), []);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === "Escape") closePreview();
    };
    if (showPreview) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [showPreview, closePreview]);

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
              <button
                className="preview-button"
                onClick={() => setShowPreview(true)}
                aria-label="Preview document"
              >
                &#128269; Preview Document
              </button>
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
      {showPreview && (
        <div
          className="preview-overlay"
          onClick={closePreview}
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
        >
          <div
            className="preview-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preview-modal-header">
              <div className="preview-modal-header-left">
                <span className="preview-modal-icon">&#128196;</span>
                <div>
                  <h2 className="preview-modal-title" id="preview-modal-title">
                    Document Preview
                  </h2>
                  <p className="preview-modal-subtitle">
                    {documentData.name}
                  </p>
                </div>
              </div>
              <button
                className="preview-close-x"
                onClick={closePreview}
                aria-label="Close preview"
              >
                &#10005;
              </button>
            </div>

            <div className="preview-meta-bar">
              <div className="preview-meta-item">
                <span className="preview-meta-label">Document ID</span>
                <span className="preview-meta-value">{documentData.id}</span>
              </div>
              <div className="preview-meta-item">
                <span className="preview-meta-label">Case ID</span>
                <span className="preview-meta-value">{documentData.caseId}</span>
              </div>
              <div className="preview-meta-item">
                <span className="preview-meta-label">Type</span>
                <span className="preview-meta-value">{documentData.type}</span>
              </div>
              <div className="preview-meta-item">
                <span className="preview-meta-label">Version</span>
                <span className="preview-meta-value">
                  {selectedVersion}
                </span>
              </div>
            </div>

            <div className="preview-document">
              <div className="preview-doc-header">
                <div className="preview-doc-seal">&#127963;</div>
                <div className="preview-doc-org">
                  <strong>Ministry of Home Affairs</strong>
                  <br />
                  Cyber Crime Investigation Division
                </div>
                <div className="preview-doc-seal">&#127963;</div>
              </div>

              <div className="preview-doc-title-block">
                <h3 className="preview-doc-heading">
                  FIRST INFORMATION REPORT
                </h3>
                <div className="preview-doc-ref">
                  FIR No: <strong>CYB-2026-04871</strong> &nbsp;|&nbsp; Date
                  Registered: <strong>12 August 2026</strong> &nbsp;|&nbsp;
                  Police Station: <strong>Cyber Crime Cell, Hyderabad</strong>
                </div>
              </div>

              <div className="preview-doc-body">
                <p>
                  On 11 August 2026, a complaint was received at the Cyber
                  Crime Cell, Hyderabad, from Mr. Rajesh Kumar Mehta (Aadhaar
                  No. XXXX-XXXX-7842), residing at 14-5-238, Road No. 3,
                  Banjara Hills, Hyderabad, Telangana 500034, alleging that he
                  has been the victim of a sophisticated online banking fraud
                  resulting in an unauthorized transfer of funds amounting to
                  INR 12,47,500 (Twelve Lakh Forty-Seven Thousand Five Hundred
                  Rupees) from his savings account held at State Bank of India,
                  Banjara Hills Branch (Account No. XXXXXXXX3947).
                </p>

                <p>
                  The complainant states that on 10 August 2026, between the
                  hours of 14:30 and 15:15 IST, he received two consecutive
                  SMS alerts from his bank notifying him of large outbound
                  transfers. Upon immediate inquiry with the bank, it was
                  confirmed that the transactions had been initiated from an
                  unrecognized IP address (103.47.211.88) originating from a
                  VPN endpoint located outside the jurisdiction. The complainant
                  avers that he did not authorize, initiate, or consent to any
                  such transfer, and that his mobile device and banking
                  credentials were not at any time in his possession outside his
                  direct control.
                </p>

                <p>
                  Preliminary investigation has revealed that the unauthorized
                  access was facilitated through a phishing campaign
                  impersonating the bank's official mobile application. A
                  malicious APK file (identified as
                  "SBi-Mobile-Secure.apk", SHA-256 hash:
                  e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855)
                  was distributed via SMS to the complainant and approximately
                  340 other individuals in the Telangana region between 05
                  August and 10 August 2026. The malware intercepted OTP
                  messages and session tokens, enabling the threat actor to
                  execute fraudulent NEFT transactions across multiple accounts.
                </p>

                <p>
                  Financial intelligence analysis conducted by the Indian
                  Computer Emergency Response Team (CERT-In) in coordination
                  with the National Cyber Crime Reporting Portal has identified
                  a network of mule accounts receiving the stolen funds. The
                  primary mule account (Account No. XXXXXXXX8812, Paytm
                  Payments Bank) received INR 8,25,000 of the stolen amount
                  before the account was frozen on 12 August 2026 at 09:00 AM
                  pursuant to an interim order of the Chief Metropolitan
                  Magistrate, Cyberabad.
                </p>

                <p>
                  The remaining INR 4,22,500 has been traced through a series
                  of cryptocurrency conversions (USDT-TRC20) and subsequent
                  transfers to wallets on decentralized exchanges. The trail
                  analysis is ongoing in coordination with international law
                  enforcement agencies under the Budapest Convention on
                  Cybercrime.
                </p>

                <p>
                  The case has been registered under Sections 420 (Cheating),
                  468 (Forgery for purpose of cheating), 471 (Using as genuine
                  a forged document), and 66C (Identity theft) and 66D
                  (Cheating by personation using computer resource) of the
                  Information Technology Act, 2000, read with Sections 34 and
                  120-B of the Indian Penal Code, 1860. Investigation is
                  assigned to Inspector Rakesh Verma, Badge No. CYB-INS-0042,
                  under the supervision of Deputy Commissioner of Police
                  (Cyber Crimes), Telangana State.
                </p>
              </div>

              <div className="preview-doc-footer">
                <div className="preview-page-indicator">
                  Page 1 of 3
                </div>
                <div className="preview-doc-notice">
                  Preview shown for demonstration. Actual document content will
                  be loaded from the backend later.
                </div>
              </div>
            </div>

            <div className="preview-modal-footer">
              <button
                className="preview-close-button"
                onClick={closePreview}
                aria-label="Close preview"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DocumentDetailsPage;
