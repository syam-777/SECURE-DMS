import { useState, useEffect, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import "./CaseDetailsPage.css";
import { apiFetch, API_BASE_URL } from "../api/api";
import AppLayout from "../components/AppLayout";

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
  CASE_SUBMITTED_FOR_REVIEW: "Submitted for review",
  CASE_ASSIGNED: "Officer assigned",
  CASE_REASSIGNED: "Officer reassigned",
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

  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [officersList, setOfficersList] = useState([]);
  const [selectedOfficerId, setSelectedOfficerId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState("");
  const [assignSuccess, setAssignSuccess] = useState("");

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

  const currentOfficer = assignments.find(
    (a) => String(a.assignment_role).toLowerCase() === "officer"
  );

  const primaryAssignee =
    caseData?.assignee_name ||
    caseData?.assignee_username ||
    currentOfficer?.full_name ||
    currentOfficer?.username ||
    null;

  const currentUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();

  const currentRole =
    typeof currentUser.role === "string" ? currentUser.role.toUpperCase() : "";
  const isAdmin = currentRole === "ADMIN";

  const loadOfficers = useCallback(async () => {
    try {
      const data = await apiFetch("/users/officers");
      setOfficersList(data.officers || []);
      const currentId = currentOfficer?.user_id;
      if (currentId != null) {
        setSelectedOfficerId(String(currentId));
      }
    } catch {
      setOfficersList([]);
    }
  }, [currentOfficer?.user_id]);

  const handleOpenAssignModal = () => {
    setAssignError("");
    setAssignSuccess("");
    loadOfficers();
    setIsAssignModalOpen(true);
  };

  const handleCloseAssignModal = () => {
    if (assigning) {
      return;
    }
    setIsAssignModalOpen(false);
    setAssignError("");
    setAssignSuccess("");
  };

  const handleAssign = async () => {
    if (!selectedOfficerId) {
      setAssignError("Please select an investigating officer.");
      return;
    }
    try {
      setAssigning(true);
      setAssignError("");
      setAssignSuccess("");
      const data = await apiFetch(`/cases/${caseId}/assignments`, {
        method: "POST",
        body: JSON.stringify({
          userId: Number(selectedOfficerId),
          assignmentRole: "officer",
        }),
      });
      if (!data.success) {
        throw new Error(data.message || "Failed to assign officer");
      }
      setAssignments(data.assignments || []);
      setAssignSuccess(data.message || "Officer assigned");
      setCaseData(null);
      setIsAssignModalOpen(false);
      await loadCase();
    } catch (err) {
      setAssignError(err.message || "Failed to assign officer");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async () => {
    if (!currentOfficer?.user_id) {
      return;
    }
    if (!window.confirm("Remove this investigating officer from the case?")) {
      return;
    }
    try {
      setAssigning(true);
      setAssignError("");
      setAssignSuccess("");
      const data = await apiFetch(
        `/cases/${caseId}/assignments/${currentOfficer.user_id}`,
        { method: "DELETE" }
      );
      if (!data.success) {
        throw new Error(data.message || "Failed to unassign officer");
      }
      setAssignments(data.assignments || []);
      setAssignSuccess("Officer unassigned");
      setCaseData(null);
      await loadCase();
    } catch (err) {
      setAssignError(err.message || "Failed to unassign officer");
    } finally {
      setAssigning(false);
    }
  };

  const canSubmitForReview =
    currentUser.role === "OFFICER" &&
    ["open", "in_progress", "returned"].includes(caseData?.status) &&
    ((caseData?.assigned_to != null &&
      Number(caseData.assigned_to) === Number(currentUser.id)) ||
      assignments.some(
        (a) =>
          Number(a.user_id) === Number(currentUser.id) &&
          a.assignment_role === "officer"
      ));

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

  const handleOpenSubmitConfirm = () => {
    setSubmitError("");
    setIsSubmitConfirmOpen(true);
  };

  const handleCloseSubmitConfirm = () => {
    if (submitting) {
      return;
    }
    setIsSubmitConfirmOpen(false);
    setSubmitError("");
  };

  const handleSubmitForReview = async () => {
    try {
      setSubmitting(true);
      setSubmitError("");
      const data = await apiFetch(`/cases/${caseId}/submit-for-review`, {
        method: "POST",
      });
      if (!data.success) {
        throw new Error(data.message || "Failed to submit case for review");
      }
      setCaseData(data.case);
      setIsSubmitConfirmOpen(false);
    } catch (err) {
      setSubmitError(err.message || "Failed to submit case for review");
    } finally {
      setSubmitting(false);
    }
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

  if (loading) {
    return (
      <div className="case-details-page">
        <AppLayout>
            <div className="cases-message">Loading case details...</div>
        </AppLayout>
      </div>
    );
  }

  if (error && !caseData) {
    const isNotFound = /not found/i.test(error);
    return (
      <div className="case-details-page">
        <AppLayout>
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
        </AppLayout>
      </div>
    );
  }

  return (
    <div className="case-details-page">
      <AppLayout>
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
                {canSubmitForReview && (
                  <button
                    className="submit-review-button"
                    onClick={handleOpenSubmitConfirm}
                  >
                    Submit for Review
                  </button>
                )}
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

          <div className="assignment-panel">
            <div className="assignment-panel-header">
              <div>
                <h3 className="section-title">Investigating Officer</h3>
                <p className="assignment-panel-subtitle">
                  The officer responsible for investigating this case.
                </p>
              </div>
            </div>

            <div className="assignment-panel-body">
              <div className="assignment-current">
                <span className="assignment-current-label">Assigned Officer</span>
                <span className="assignment-current-name">
                  {primaryAssignee || "None — no officer assigned"}
                </span>
              </div>

              {isAdmin ? (
                <div className="assignment-actions">
                  {currentOfficer ? (
                    <>
                      <button
                        className="assign-officer-button"
                        onClick={handleOpenAssignModal}
                        disabled={assigning}
                      >
                        Reassign Officer
                      </button>
                      <button
                        className="unassign-officer-button"
                        onClick={handleUnassign}
                        disabled={assigning}
                      >
                        Unassign Officer
                      </button>
                    </>
                  ) : (
                    <button
                      className="assign-officer-button"
                      onClick={handleOpenAssignModal}
                      disabled={assigning}
                    >
                      Assign Officer
                    </button>
                  )}
                  {assignError && (
                    <span className="assignment-message assignment-error">
                      {assignError}
                    </span>
                  )}
                  {assignSuccess && (
                    <span className="assignment-message assignment-success">
                      {assignSuccess}
                    </span>
                  )}
                </div>
              ) : (
                currentOfficer && (
                  <div className="assignment-assigned-note">
                    {currentRole === "OFFICER"
                      ? "You are assigned to this case."
                      : null}
                  </div>
                )
              )}
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

          {isSubmitConfirmOpen && (
            <div
              className="modal-overlay"
              onClick={handleCloseSubmitConfirm}
              role="dialog"
              aria-modal="true"
              aria-labelledby="submit-review-title"
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h2 id="submit-review-title" className="modal-title">
                      Submit for Review
                    </h2>
                    <p className="modal-subtitle">
                      Submit this case to the reviewer queue?
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={handleCloseSubmitConfirm}
                    aria-label="Close"
                    disabled={submitting}
                  >
                    &times;
                  </button>
                </div>

                <p className="submit-review-note">
                  Once submitted, this case will be set to &quot;Under
                  Review&quot; and queued for a reviewer to approve, reject,
                  or return it.
                </p>

                {submitError && (
                  <div className="cases-error">{submitError}</div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={handleCloseSubmitConfirm}
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="submit-review-confirm-button"
                    onClick={handleSubmitForReview}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Confirm Submit"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {isAssignModalOpen && (
            <div
              className="modal-overlay"
              onClick={handleCloseAssignModal}
              role="dialog"
              aria-modal="true"
              aria-labelledby="assign-officer-title"
            >
              <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="modal-header">
                  <div>
                    <h2 id="assign-officer-title" className="modal-title">
                      {currentOfficer ? "Reassign Officer" : "Assign Officer"}
                    </h2>
                    <p className="modal-subtitle">
                      Select an active investigating officer for case{" "}
                      {caseData.case_number}.
                    </p>
                  </div>
                  <button
                    className="modal-close"
                    onClick={handleCloseAssignModal}
                    aria-label="Close"
                    disabled={assigning}
                  >
                    &times;
                  </button>
                </div>

                <p className="submit-review-note">
                  Assigning or reassigning will set this officer as the current
                  investigating officer for the case and log the change for
                  audit.
                </p>

                {assignError && (
                  <div className="cases-error">{assignError}</div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="assign-officer-select">
                    Investigating Officer <span className="required-mark">*</span>
                  </label>
                  <select
                    id="assign-officer-select"
                    className="form-input"
                    value={selectedOfficerId}
                    onChange={(e) => setSelectedOfficerId(e.target.value)}
                    disabled={assigning}
                  >
                    <option value="">Select an officer...</option>
                    {officersList.map((o) => (
                      <option key={o.id} value={String(o.id)}>
                        {o.full_name || o.username}
                        {o.email ? ` (${o.email})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="modal-actions">
                  <button
                    type="button"
                    className="cancel-button"
                    onClick={handleCloseAssignModal}
                    disabled={assigning}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="assign-officer-confirm-button"
                    onClick={handleAssign}
                    disabled={assigning}
                  >
                    {assigning
                      ? "Saving..."
                      : currentOfficer
                      ? "Confirm Reassign"
                      : "Confirm Assignment"}
                  </button>
                </div>
              </div>
            </div>
          )}
      </AppLayout>
    </div>
  );
}

export default CaseDetailsPage;
