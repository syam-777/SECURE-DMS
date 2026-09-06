import { useState, useEffect, useCallback } from "react";
import { NavLink, Link, useNavigate, useParams } from "react-router-dom";
import "./CaseDetailsPage.css";
import { apiFetch, API_BASE_URL } from "../api/api";

const caseTypeOptions = [
  "Cyber Crime",
  "Financial Crime",
  "Theft",
  "Property",
  "Forgery",
  "Public Order",
  "Other",
];

const priorityOptions = ["Low", "Medium", "High", "Critical"];

const priorityValueMap = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

const caseTypeValueMap = {
  "Cyber Crime": "Cyber Crime",
  "Financial Crime": "Financial Crime",
  Theft: "Theft",
  Property: "Property",
  Forgery: "Forgery",
  "Public Order": "Public Order",
  Other: "Other",
};

const activityLabels = {
  CASE_CREATED: "Case created",
  CASE_UPDATED: "Case updated",
  CASE_STATUS_CHANGED: "Status changed",
  CASE_ASSIGNED: "Officer assigned",
  CASE_UNASSIGNED: "Officer unassigned",
  CASE_DELETED: "Case deleted",
  DOCUMENT_CREATED: "Document uploaded",
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_DOWNLOADED: "Document downloaded",
  DOCUMENT_DELETED: "Document deleted",
  DOCUMENT_SUMMARIZED: "Document summarized",
  VERSION_CREATED: "Version created",
};

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString("en-IN") : "-";
}

function formatDateTime(value) {
  return value
    ? new Date(value).toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "-";
}

function titleCase(value) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fileRequest(path, options = {}) {
  const token = localStorage.getItem("token");
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    let message = "Request failed";
    try {
      message = (await response.json()).message || message;
    } catch {
      /* keep default message */
    }
    throw new Error(message);
  }
  return response;
}

function CaseDetailsPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState("documents");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    type: "",
    priority: "",
    description: "",
  });
  const [editErrors, setEditErrors] = useState({});

  const loadCase = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch(`/cases/${caseId}`);
      if (!data.success) {
        throw new Error(data.message || "Failed to load case");
      }
      setCaseData(data.case);
      setAssignments(data.assignments || []);
    } catch (err) {
      setError(err.message || "Failed to load case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const loadDocuments = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("caseId", String(caseId));
      params.set("limit", "100");
      params.set("sort", "created_at");
      params.set("order", "desc");
      const data = await apiFetch(`/documents?${params.toString()}`);
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    }
  }, [caseId]);

  const loadActivity = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      params.set("resourceType", "case");
      params.set("limit", "100");
      params.set("sort", "created_at");
      params.set("order", "desc");
      const data = await apiFetch(`/audit-logs?${params.toString()}`);
      const records = data.data || [];
      const filtered = records.filter(
        (rec) => Number(rec.resourceId) === Number(caseId)
      );
      setActivity(filtered);
    } catch {
      setActivity([]);
    }
  }, [caseId]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  useEffect(() => {
    if (caseData) {
      loadDocuments();
      loadActivity();
    }
  }, [caseData, loadDocuments, loadActivity]);

  const primaryAssignee =
    caseData?.assignee_name ||
    caseData?.assignee_username ||
    (assignments.length > 0
      ? assignments[0].full_name || assignments[0].username
      : null) ||
    null;

  const handleOpenEdit = () => {
    setEditForm({
      title: caseData.title || "",
      type: caseTypeValueMap[caseData.case_type] || caseData.case_type || "",
      priority: priorityValueMap[caseData.priority] || caseData.priority || "",
      description: caseData.description || "",
    });
    setEditErrors({});
    setIsEditModalOpen(true);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setEditForm((prev) => ({ ...prev, [name]: value }));
    setEditErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateEdit = () => {
    const errors = {};
    if (!editForm.title.trim()) {
      errors.title = "Case title is required.";
    }
    if (!editForm.type) {
      errors.type = "Please select a case type.";
    }
    if (!editForm.priority) {
      errors.priority = "Please select a priority.";
    }
    if (!editForm.description.trim()) {
      errors.description = "Description is required.";
    }
    return errors;
  };

  const handleSaveChanges = async (e) => {
    e.preventDefault();
    const errors = validateEdit();
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    try {
      setSaving(true);
      const data = await apiFetch(`/cases/${caseId}`, {
        method: "PUT",
        body: JSON.stringify({
          title: editForm.title.trim(),
          caseType: editForm.type,
          description: editForm.description.trim(),
          priority: editForm.priority.toLowerCase(),
        }),
      });
      if (!data.success) {
        throw new Error(data.message || "Failed to update case");
      }
      setCaseData(data.case);
      setIsEditModalOpen(false);
      setEditErrors({});
    } catch (err) {
      setError(err.message || "Failed to update case");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseEdit = () => {
    setIsEditModalOpen(false);
    setEditErrors({});
  };

  const downloadDocument = async (doc) => {
    try {
      const response = await fileRequest(`/documents/${doc.id}/download`);
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.title || `document-${doc.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Download failed");
    }
  };

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      /* ignore logout errors */
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  if (loading) {
    return (
      <div className="case-details-page">
        <nav className="navbar">
          <div className="navbar-brand">
            <span className="brand-icon">&#128274;</span>
            <span className="brand-text">Secure DMS</span>
          </div>
        </nav>
        <div className="dashboard-body">
          <main className="main-content">
            <div className="cases-message">Loading case details...</div>
          </main>
        </div>
      </div>
    );
  }

  if (error && !caseData) {
    const isNotFound = /not found/i.test(error);
    return (
      <div className="case-details-page">
        <nav className="navbar">
          <div className="navbar-brand">
            <span className="brand-icon">&#128274;</span>
            <span className="brand-text">Secure DMS</span>
          </div>
          <div className="navbar-right">
            <button className="logout-button" onClick={logout}>
              Logout
            </button>
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
                  <h1 className="page-title">
                    {isNotFound ? "Case Not Found" : "Error"}
                  </h1>
                  <p className="page-description">
                    {isNotFound ? (
                      <>
                        No case found with ID <strong>{caseId}</strong>.
                      </>
                    ) : (
                      error
                    )}
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
          <button className="logout-button" onClick={logout}>
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
          {error && caseData && (
            <div className="cases-error">{error}</div>
          )}

          <div className="page-heading">
            <div className="page-heading-row">
              <div>
                <h1 className="page-title">Case Details</h1>
                <p className="page-description">
                  Viewing details for case {caseData.case_number}.
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
              <div className="case-info-header-actions">
                <span
                  className={`status-badge status-${String(caseData.status).toLowerCase()}`}
                >
                  {titleCase(caseData.status)}
                </span>
                <button className="edit-case-button" onClick={handleOpenEdit}>
                  &#9998; Edit Case
                </button>
              </div>
            </div>
            <div className="case-info-grid">
              <div className="case-info-field">
                <span className="case-info-label">Case ID</span>
                <span className="case-info-value case-id-highlight">
                  {caseData.case_number}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Case Type</span>
                <span className="case-info-value">
                  {caseData.case_type || "—"}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Priority</span>
                <span className="case-info-value">
                  {priorityValueMap[caseData.priority] ||
                    titleCase(caseData.priority) ||
                    "—"}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Assigned Officer</span>
                <span className="case-info-value">
                  {primaryAssignee || "—"}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Created By</span>
                <span className="case-info-value">
                  {caseData.creator_name ||
                    caseData.creator_username ||
                    "—"}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Created Date</span>
                <span className="case-info-value">
                  {formatDate(caseData.created_at)}
                </span>
              </div>
              <div className="case-info-field">
                <span className="case-info-label">Last Updated</span>
                <span className="case-info-value">
                  {formatDate(caseData.updated_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="case-description-section">
            <h3 className="section-title">Case Description</h3>
            <p className="description-text">
              {caseData.description || "No description provided."}
            </p>
          </div>

          <div className="case-tabs">
            <button
              className={`case-tab ${activeTab === "documents" ? "active" : ""}`}
              onClick={() => setActiveTab("documents")}
            >
              Documents ({documents.length})
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
              {documents.length === 0 ? (
                <div className="cases-message">
                  No documents are associated with this case.
                </div>
              ) : (
                <table className="case-documents-table">
                  <thead>
                    <tr>
                      <th>Document ID</th>
                      <th>Document Name</th>
                      <th>Document Type</th>
                      <th>Uploaded By</th>
                      <th>Uploaded Date</th>
                      <th>Version</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="doc-id">DOC-{doc.id}</td>
                        <td>{doc.title}</td>
                        <td>{doc.document_type || "-"}</td>
                        <td>{doc.uploader_name || doc.uploader_username || doc.uploaded_by || "-"}</td>
                        <td>{formatDate(doc.created_at)}</td>
                        <td>{doc.current_version}</td>
                        <td>
                          <span
                            className={`integrity-badge integrity-${String(doc.status).toLowerCase()}`}
                          >
                            {titleCase(doc.status)}
                          </span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <Link
                              className="view-button"
                              to={`/document-details/${doc.id}`}
                            >
                              View
                            </Link>
                            <button
                              className="download-button"
                              onClick={() => downloadDocument(doc)}
                            >
                              Download
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "activity" && (
            <div className="activity-section">
              {activity.length === 0 ? (
                <div className="cases-message">
                  No recorded activity for this case.
                </div>
              ) : (
                <div className="activity-list">
                  {activity.map((item) => {
                    const label =
                      activityLabels[item.action] || titleCase(item.action);
                    const cssClass = String(item.action).toLowerCase();
                    return (
                      <div className="activity-entry" key={item.id}>
                        <div className="activity-icon">
                          <span>&#128196;</span>
                        </div>
                        <div className="activity-content">
                          <div className="activity-header">
                            <span
                              className={`action-badge action-${cssClass}`}
                            >
                              {label}
                            </span>
                            <span className="activity-date">
                              {formatDateTime(item.createdAt)}
                            </span>
                          </div>
                          <p className="activity-details">
                            {item.details && item.details.caseNumber
                              ? `${label} for case ${item.details.caseNumber}.`
                              : item.userId
                              ? `${label} for case ${caseData.case_number}.`
                              : `${label} for case ${caseData.case_number}.`}
                          </p>
                          <span className="activity-user">
                            by User #{item.userId != null ? item.userId : "System"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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

          {isEditModalOpen && (
            <div
              className="modal-overlay"
              onClick={handleCloseEdit}
              role="dialog"
              aria-modal="true"
              aria-labelledby="edit-case-title"
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h2 id="edit-case-title" className="modal-title">
                      Edit Case
                    </h2>
                    <p className="modal-subtitle">
                      Update the case details below and save your changes.
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={handleCloseEdit}
                    aria-label="Close"
                  >
                    &times;
                  </button>
                </div>

                <form onSubmit={handleSaveChanges} noValidate>
                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-title">
                      Case Title <span className="required-mark">*</span>
                    </label>
                    <input
                      id="edit-title"
                      name="title"
                      type="text"
                      className={`form-input ${editErrors.title ? "has-error" : ""}`}
                      placeholder="Enter case title"
                      value={editForm.title}
                      onChange={handleEditChange}
                    />
                    {editErrors.title && (
                      <span className="form-error">{editErrors.title}</span>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="edit-type">
                        Case Type <span className="required-mark">*</span>
                      </label>
                      <select
                        id="edit-type"
                        name="type"
                        className={`form-input ${editErrors.type ? "has-error" : ""}`}
                        value={editForm.type}
                        onChange={handleEditChange}
                      >
                        <option value="">Select case type</option>
                        {caseTypeOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {editErrors.type && (
                        <span className="form-error">{editErrors.type}</span>
                      )}
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="edit-priority">
                        Priority <span className="required-mark">*</span>
                      </label>
                      <select
                        id="edit-priority"
                        name="priority"
                        className={`form-input ${editErrors.priority ? "has-error" : ""}`}
                        value={editForm.priority}
                        onChange={handleEditChange}
                      >
                        <option value="">Select priority</option>
                        {priorityOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      {editErrors.priority && (
                        <span className="form-error">
                          {editErrors.priority}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="edit-description">
                      Description <span className="required-mark">*</span>
                    </label>
                    <textarea
                      id="edit-description"
                      name="description"
                      className={`form-input form-textarea ${editErrors.description ? "has-error" : ""}`}
                      placeholder="Enter case description"
                      rows="4"
                      value={editForm.description}
                      onChange={handleEditChange}
                    />
                    {editErrors.description && (
                      <span className="form-error">
                        {editErrors.description}
                      </span>
                    )}
                  </div>

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="cancel-button"
                      onClick={handleCloseEdit}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="create-case-button"
                      disabled={saving}
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default CaseDetailsPage;
