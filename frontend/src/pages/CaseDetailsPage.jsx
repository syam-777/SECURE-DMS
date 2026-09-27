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
  CASE_REVIEW_APPROVED: "Case review approved",
  CASE_REVIEW_REJECTED: "Case review rejected",
  CASE_REVIEW_RETURNED: "Case returned for revision",
  DOCUMENT_CREATED: "Document uploaded",
  DOCUMENT_UPLOADED: "Document uploaded",
  DOCUMENT_UPDATED: "Document updated",
  DOCUMENT_DOWNLOADED: "Document downloaded",
  DOCUMENT_DELETED: "Document deleted",
  DOCUMENT_SUMMARIZED: "Document summarized",
  DOCUMENT_CHAIN_VIEWED: "Chain of custody viewed",
  DOCUMENT_REVIEW_APPROVED: "Document review approved",
  DOCUMENT_REVIEW_REJECTED: "Document review rejected",
  DOCUMENT_REVIEW_RETURNED: "Document returned for revision",
  VERSION_CREATED: "Version created",
  VERSION_DOWNLOADED: "Version downloaded",
  VERSION_INTEGRITY_VERIFIED: "Version integrity checked",
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

  const [intelligence, setIntelligence] = useState(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceError, setIntelligenceError] = useState("");

  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState("");

  const [caseSummary, setCaseSummary] = useState(null);
  const [caseSummaryLoading, setCaseSummaryLoading] = useState(false);
  const [caseSummaryError, setCaseSummaryError] = useState("");

  const [activeTab, setActiveTab] = useState("overview");
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

  const loadIntelligence = useCallback(async () => {
    if (intelligence) {
      return;
    }
    setIntelligenceLoading(true);
    setIntelligenceError("");
    try {
      const data = await apiFetch(`/cases/${caseId}/intelligence`);
      if (!data.success) {
        throw new Error(data.message || "Failed to load case intelligence");
      }
      setIntelligence(data);
    } catch (err) {
      setIntelligenceError(err.message || "Failed to load case intelligence");
    } finally {
      setIntelligenceLoading(false);
    }
  }, [caseId, intelligence]);

  const loadTimeline = useCallback(async () => {
    if (timeline) {
      return;
    }
    setTimelineLoading(true);
    setTimelineError("");
    try {
      const data = await apiFetch(`/cases/${caseId}/timeline`);
      if (!data.success) {
        throw new Error(data.message || "Failed to load investigation timeline");
      }
      setTimeline(data);
    } catch (err) {
      setTimelineError(err.message || "Failed to load investigation timeline");
    } finally {
      setTimelineLoading(false);
    }
  }, [caseId, timeline]);

  useEffect(() => {
    loadCase();
  }, [loadCase]);

  useEffect(() => {
    if (caseData) {
      loadDocuments();
      loadActivity();
    }
  }, [caseData, loadDocuments, loadActivity]);

  const handleOpenIntelligenceTab = () => {
    setActiveTab("intelligence");
    loadIntelligence();
  };

  const handleOpenTimelineTab = () => {
    setActiveTab("timeline");
    loadTimeline();
  };

  const handleGenerateSummary = useCallback(async () => {
    if (caseSummaryLoading) {
      return;
    }
    setCaseSummary(null);
    setCaseSummaryError("");
    setCaseSummaryLoading(true);
    try {
      const data = await apiFetch(`/cases/${caseId}/summary`, {
        method: "POST",
      });
      if (!data.success) {
        throw new Error(data.message || "Failed to generate case summary");
      }
      setCaseSummary(data);
    } catch (err) {
      setCaseSummaryError(err.message || "Failed to generate case summary");
    } finally {
      setCaseSummaryLoading(false);
    }
  }, [caseId, caseSummaryLoading]);

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

  const overviewVersionCount = documents.reduce(
    (sum, doc) => sum + Number(doc.current_version || 0),
    0
  );

  const latestReviewRecord = activity.find((item) =>
    String(item.action).startsWith("CASE_REVIEW_")
  );

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
              className={`case-tab ${activeTab === "overview" ? "active" : ""}`}
              onClick={() => setActiveTab("overview")}
            >
              Workspace Overview
            </button>
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
            <button
              className={`case-tab ${activeTab === "chain" ? "active" : ""}`}
              onClick={() => setActiveTab("chain")}
            >
              Chain of Custody
            </button>
            <button
              className={`case-tab ${activeTab === "timeline" ? "active" : ""}`}
              onClick={handleOpenTimelineTab}
            >
              Investigation Timeline
            </button>
            <button
              className={`case-tab ${activeTab === "intelligence" ? "active" : ""}`}
              onClick={handleOpenIntelligenceTab}
            >
              Case Intelligence
            </button>
            <Link
              className="case-tab case-tab-link"
              to={`/cases/${caseId}/evidence-graph`}
            >
              Evidence Graph
            </Link>
          </div>

          {activeTab === "overview" && (
            <div className="workspace-overview">
              <div className="workspace-section">
                <div className="workspace-section-heading">
                  <h3 className="section-title">Investigation Stats</h3>
                </div>
                <div className="intelligence-cards">
                  <div className="intelligence-card">
                    <span className="intelligence-card-icon">&#128196;</span>
                    <span className="intelligence-card-value">
                      {documents.length}
                    </span>
                    <span className="intelligence-card-label">Documents</span>
                  </div>
                  <div className="intelligence-card">
                    <span className="intelligence-card-icon">&#128213;</span>
                    <span className="intelligence-card-value">
                      {overviewVersionCount}
                    </span>
                    <span className="intelligence-card-label">Versions</span>
                  </div>
                  <div className="intelligence-card">
                    <span className="intelligence-card-icon">&#128101;</span>
                    <span className="intelligence-card-value">
                      {assignments.length}
                    </span>
                    <span className="intelligence-card-label">
                      Assignments
                    </span>
                  </div>
                </div>
              </div>

              <div className="workspace-section">
                <h3 className="section-title">
                  Security &amp; Integrity Snapshot
                </h3>
                <div className="workspace-security">
                  <div className="workspace-security-item">
                    {latestReviewRecord ? (
                      <span
                        className={`workspace-security-badge action-badge action-${String(
                          latestReviewRecord.action
                        ).toLowerCase()}`}
                      >
                        {activityLabels[latestReviewRecord.action] ||
                          titleCase(latestReviewRecord.action)}
                      </span>
                    ) : (
                      <span className="workspace-security-badge workspace-security-badge-neutral">
                        No approval recorded
                      </span>
                    )}
                    <span className="workspace-security-text">
                      {latestReviewRecord
                        ? `Last review decision recorded ${formatDateTime(
                            latestReviewRecord.createdAt
                          )}.`
                        : "No review decision has been recorded for this case yet."}
                    </span>
                  </div>
                  <div className="workspace-security-item">
                    <span className="workspace-security-text">
                      {documents.length} document
                      {documents.length === 1 ? "" : "s"} under tamper-evident
                      custody tracking.
                    </span>
                  </div>
                  <div className="workspace-security-note">
                    Version-level integrity results and digital signature
                    verification are available on the dedicated views below.
                  </div>
                </div>
                <div className="workspace-quick-actions">
                  <button
                    className="workspace-quick-action"
                    onClick={() => setActiveTab("chain")}
                  >
                    <span className="workspace-quick-action-title">
                      Chain of Custody
                    </span>
                    <span className="workspace-quick-action-text">
                      View custody trail
                    </span>
                  </button>
                  <button
                    className="workspace-quick-action"
                    onClick={handleOpenIntelligenceTab}
                  >
                    <span className="workspace-quick-action-title">
                      Case Intelligence
                    </span>
                    <span className="workspace-quick-action-text">
                      Integrity &amp; review status
                    </span>
                  </button>
                </div>
              </div>

              <div className="workspace-section">
                <div className="workspace-section-heading">
                  <h3 className="section-title">
                    Recent Investigation Activity
                  </h3>
                  {activity.length > 0 && (
                    <button
                      className="workspace-view-all"
                      onClick={() => setActiveTab("activity")}
                    >
                      View all
                    </button>
                  )}
                </div>
                {activity.length === 0 ? (
                  <div className="cases-message">
                    No recorded activity for this case.
                  </div>
                ) : (
                  <div className="workspace-activity-preview">
                    {activity.slice(0, 5).map((item) => {
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
                            <span className="activity-user">
                              by User #
                              {item.userId != null ? item.userId : "System"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="workspace-section">
                <h3 className="section-title">Workspace Quick Actions</h3>
                <div className="workspace-quick-actions">
                  <button
                    className="workspace-quick-action"
                    onClick={() => setActiveTab("documents")}
                  >
                    <span className="workspace-quick-action-title">
                      Documents
                    </span>
                    <span className="workspace-quick-action-text">
                      Browse, download &amp; upload evidence
                    </span>
                  </button>
                  <button
                    className="workspace-quick-action"
                    onClick={handleOpenIntelligenceTab}
                  >
                    <span className="workspace-quick-action-title">
                      Case Intelligence
                    </span>
                    <span className="workspace-quick-action-text">
                      AI summary, integrity &amp; reviews
                    </span>
                  </button>
                  <button
                    className="workspace-quick-action"
                    onClick={handleOpenTimelineTab}
                  >
                    <span className="workspace-quick-action-title">
                      Investigation Timeline
                    </span>
                    <span className="workspace-quick-action-text">
                      Chronological case history
                    </span>
                  </button>
                  <Link
                    className="workspace-quick-action workspace-quick-action-link"
                    to={`/cases/${caseId}/evidence-graph`}
                  >
                    <span className="workspace-quick-action-title">
                      Evidence Graph
                    </span>
                    <span className="workspace-quick-action-text">
                      Entity relationship view
                    </span>
                  </Link>
                  <button
                    className="workspace-quick-action"
                    onClick={() => setActiveTab("chain")}
                  >
                    <span className="workspace-quick-action-title">
                      Chain of Custody
                    </span>
                    <span className="workspace-quick-action-text">
                      Tamper-evident custody trails
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}

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

          {activeTab === "chain" && (
            <div className="table-section">
              <p className="description-text">
                Each document attached to this case has its own tamper-evident
                custody trail (uploads, versions, reviews, and audit events).
                Open a document below to view its Chain of Custody.
              </p>
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
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="doc-id">DOC-{doc.id}</td>
                        <td>{doc.title}</td>
                        <td>{doc.document_type || "-"}</td>
                        <td>
                          {doc.uploader_name ||
                            doc.uploader_username ||
                            doc.uploaded_by ||
                            "-"}
                        </td>
                        <td>{formatDate(doc.created_at)}</td>
                        <td>{doc.current_version}</td>
                        <td>
                          <div className="action-buttons">
                            <Link
                              className="view-button"
                              to={`/document-details/${doc.id}`}
                            >
                              View Chain of Custody
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="timeline-section">
              {timelineError && (
                <div className="cases-error">{timelineError}</div>
              )}

              {timelineLoading && !timeline ? (
                <div className="cases-message">
                  Loading investigation timeline...
                </div>
              ) : !timeline || timeline.events.length === 0 ? (
                <div className="cases-message">
                  No timeline events recorded for this case.
                </div>
              ) : (
                <div className="timeline-list">
                  {timeline.events.map((event) => {
                    const isDocument = event.scope === "document";
                    const isIntegrity =
                      event.type === "VERSION_INTEGRITY_VERIFIED";
                    const isReview =
                      event.type === "CASE_REVIEW_APPROVED" ||
                      event.type === "CASE_REVIEW_REJECTED" ||
                      event.type === "CASE_REVIEW_RETURNED";
                    const sig = event.metadata && event.metadata.signature;
                    return (
                      <div
                        className={`timeline-entry ${
                          isReview ? "timeline-entry-review" : ""
                        }`}
                        key={event.id != null ? event.id : `${event.type}-${event.timestamp}`}
                      >
                        <div className="timeline-rail">
                          <span
                            className={`timeline-dot ${
                              isIntegrity
                                ? event.metadata.integrityValid
                                  ? "timeline-dot-verified"
                                  : "timeline-dot-failed"
                                : isDocument
                                ? "timeline-dot-document"
                                : "timeline-dot-case"
                            }`}
                          />
                        </div>
                        <div className="timeline-content">
                          <div className="timeline-header">
                            <span
                              className={`action-badge action-${String(
                                event.type
                              ).toLowerCase()}`}
                            >
                              {event.title}
                            </span>
                            <span className="timeline-date">
                              {formatDateTime(event.timestamp)}
                            </span>
                          </div>

                          <p className="timeline-detail">
                            {isDocument && event.resource
                              ? `On ${event.resource.documentTitle ||
                                  `document #${event.resource.documentId}`}.`
                              : `On case ${caseData.case_number}.`}
                            {event.resource && event.resource.versionNumber != null
                              ? ` Version ${
                                  event.resource.versionNumber
                                } ${event.description || ""}`.trim()
                              : ""}
                          </p>

                          {event.metadata && event.metadata.previousStatus && (
                            <p className="timeline-meta">
                              {event.metadata.previousStatus} &rarr;{" "}
                              {event.metadata.newStatus}
                            </p>
                          )}

                          {event.metadata && event.metadata.reviewNote && (
                            <p className="timeline-review-note">
                              &ldquo;{event.metadata.reviewNote}&rdquo;
                            </p>
                          )}

                          {sig && sig.exists && (
                            <div
                              className={`timeline-signature ${
                                sig.valid
                                  ? "timeline-signature-valid"
                                  : "timeline-signature-invalid"
                              }`}
                            >
                              <span className="timeline-signature-icon">
                                {sig.valid ? "✓" : "✕"}
                              </span>
                              <span>
                                {sig.valid
                                  ? "Digitally signed and verified"
                                  : "Digital signature verification failed"}
                                {sig.algorithm ? ` (${sig.algorithm})` : ""}
                              </span>
                            </div>
                          )}

                          <span className="timeline-user">
                            by {event.actor || "System"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {activeTab === "intelligence" && (
            <div className="intelligence-section">
              <div className="intelligence-panel ai-summary-panel">
                <div className="ai-summary-header">
                  <div>
                    <h3 className="section-title">AI Case Summary</h3>
                    <p className="ai-summary-subtitle">
                      Generate an AI-powered summary from the documents in this
                      case.
                    </p>
                  </div>
                  <button
                    className="ai-summary-generate"
                    onClick={handleGenerateSummary}
                    disabled={caseSummaryLoading}
                  >
                    {caseSummaryLoading
                      ? "Generating..."
                      : "Generate Summary"}
                  </button>
                </div>

                {caseSummaryError && (
                  <div className="cases-error">{caseSummaryError}</div>
                )}

                {caseSummaryLoading && (
                  <div className="cases-message ai-summary-loading">
                    Generating summary...
                  </div>
                )}

                {caseSummary && !caseSummaryLoading && (
                  <div className="ai-summary-body">
                    <p className="ai-summary-text">{caseSummary.summary}</p>

                    {caseSummary.sources && caseSummary.sources.length > 0 && (
                      <>
                        <h4 className="ai-summary-sources-heading">
                          Sources
                        </h4>
                        <div className="ai-summary-sources">
                          {caseSummary.sources.map((source) => (
                            <Link
                              className="ai-summary-source"
                              key={`${source.documentId}-${source.versionNumber}`}
                              to={`/document-details/${source.documentId}`}
                            >
                              {source.title} — Version {source.versionNumber}
                            </Link>
                          ))}
                        </div>
                      </>
                    )}

                    {caseSummary.truncated && (
                      <p className="ai-summary-truncated">
                        Summary generated from a limited document context.
                      </p>
                    )}

                    <p className="ai-summary-meta">
                      Generated: {formatDateTime(caseSummary.generatedAt)} ·
                      Documents used: {caseSummary.documentsUsed}
                    </p>
                  </div>
                )}
              </div>

              {intelligenceError && (
                <div className="cases-error">{intelligenceError}</div>
              )}

              {intelligenceLoading && !intelligence ? (
                <div className="cases-message">Loading case intelligence...</div>
              ) : !intelligence ? (
                <div className="cases-message">
                  No intelligence data available for this case.
                </div>
              ) : (
                <>
                  <div className="intelligence-cards">
                    <div className="intelligence-card">
                      <span className="intelligence-card-icon">&#128196;</span>
                      <span className="intelligence-card-value">
                        {intelligence.documents.length}
                      </span>
                      <span className="intelligence-card-label">
                        Documents
                      </span>
                    </div>
                    <div className="intelligence-card">
                      <span className="intelligence-card-icon">&#129511;</span>
                      <span className="intelligence-card-value">
                        {intelligence.integrity.versions}
                      </span>
                      <span className="intelligence-card-label">
                        Versions
                      </span>
                    </div>
                    <div className="intelligence-card">
                      <span className="intelligence-card-icon">&#128101;</span>
                      <span className="intelligence-card-value">
                        {intelligence.assignments.length}
                      </span>
                      <span className="intelligence-card-label">
                        Assigned Officers
                      </span>
                    </div>
                    <div className="intelligence-card">
                      <span className="intelligence-card-icon">&#11088;</span>
                      <span className="intelligence-card-value">
                        {intelligence.review.totalReviews}
                      </span>
                      <span className="intelligence-card-label">
                        Case Reviews
                      </span>
                    </div>
                    <div className="intelligence-card intelligence-card-verified">
                      <span className="intelligence-card-icon">&#9989;</span>
                      <span className="intelligence-card-value">
                        {intelligence.integrity.verified}
                      </span>
                      <span className="intelligence-card-label">
                        Versions Verified
                      </span>
                    </div>
                    <div className="intelligence-card intelligence-card-failed">
                      <span className="intelligence-card-icon">&#9888;&#65039;</span>
                      <span className="intelligence-card-value">
                        {intelligence.integrity.failed}
                      </span>
                      <span className="intelligence-card-label">
                        Integrity Failures
                      </span>
                    </div>
                  </div>

                  <div className="intelligence-panel">
                    <h3 className="section-title">Documents &amp; Integrity</h3>
                    {intelligence.documents.length === 0 ? (
                      <div className="cases-message">
                        No documents are associated with this case.
                      </div>
                    ) : (
                      <div className="table-section intelligence-table-wrap">
                        <table className="case-documents-table">
                          <thead>
                            <tr>
                              <th>Document ID</th>
                              <th>Document Name</th>
                              <th>Type</th>
                              <th>Uploaded By</th>
                              <th>Uploaded Date</th>
                              <th>Current Version</th>
                              <th>Version Count</th>
                              <th>Status</th>
                              <th>Integrity</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {intelligence.documents.map((item) => (
                              <tr key={item.document.id}>
                                <td className="doc-id">
                                  DOC-{item.document.id}
                                </td>
                                <td>{item.document.title}</td>
                                <td>{item.document.documentType || "-"}</td>
                                <td>
                                  {item.document.uploaderName ||
                                    item.document.uploaderUsername ||
                                    "—"}
                                </td>
                                <td>{formatDate(item.document.createdAt)}</td>
                                <td>{item.document.currentVersion}</td>
                                <td>{item.versions.length}</td>
                                <td>
                                  <span
                                    className={`integrity-badge integrity-${String(
                                      item.document.status
                                    ).toLowerCase()}`}
                                  >
                                    {titleCase(item.document.status)}
                                  </span>
                                </td>
                                <td>
                                  <span className="integrity-summary">
                                    <span className="integrity-summary-verified">
                                      {item.integrity.verified} OK
                                    </span>
                                    <span className="integrity-summary-failed">
                                      {item.integrity.failed} FAIL
                                    </span>
                                    <span className="integrity-summary-pending">
                                      {item.integrity.notVerified} NOT CHECKED
                                    </span>
                                  </span>
                                </td>
                                <td>
                                  <div className="action-buttons">
                                    <Link
                                      className="view-button"
                                      to={`/document-details/${item.document.id}`}
                                    >
                                      View
                                    </Link>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="intelligence-panel">
                    <h3 className="section-title">Review Status</h3>
                    <div className="review-status-block">
                      <span
                        className={`status-badge status-${String(
                          intelligence.review.status
                        ).toLowerCase()}`}
                      >
                        {titleCase(intelligence.review.status)}
                      </span>
                      <span className="review-status-count">
                        {intelligence.review.totalReviews} review decision
                        {intelligence.review.totalReviews === 1 ? "" : "s"}{" "}
                        recorded
                      </span>
                    </div>
                    {intelligence.review.history.length === 0 ? (
                      <div className="cases-message">
                        No review decisions have been recorded for this case.
                      </div>
                    ) : (
                      <div className="review-history-list">
                        {intelligence.review.history.map((review, index) => (
                          <div
                            className="review-history-item"
                            key={`${review.createdAt}-${index}`}
                          >
                            <div className="review-history-main">
                              <span
                                className={`action-badge review-action-${review.action}`}
                              >
                                {titleCase(review.action)}
                              </span>
                              <span className="review-history-note">
                                {review.reviewNote || "No note provided."}
                              </span>
                            </div>
                            <div className="review-history-meta">
                              <span className="activity-user">
                                {review.reviewerName ||
                                  review.reviewerUsername ||
                                  `User #${review.reviewerId}`}
                              </span>
                              <span className="activity-date">
                                {formatDateTime(review.createdAt)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="intelligence-panel">
                    <h3 className="section-title">Case Activity Timeline</h3>
                    {intelligence.activity.length === 0 ? (
                      <div className="cases-message">
                        No recorded activity for this case.
                      </div>
                    ) : (
                      <div className="activity-list">
                        {intelligence.activity.map((item) => {
                          const label =
                            activityLabels[item.action] || titleCase(item.action);
                          const cssClass = String(item.action).toLowerCase();
                          const subject =
                            item.scope === "document"
                              ? `document ${item.documentTitle ||
                                  `#${item.documentId}`}`
                              : `case ${caseData.case_number}`;
                          return (
                            <div
                              className="activity-entry"
                              key={`${item.id}`}
                            >
                              <div className="activity-icon">
                                <span>
                                  {item.scope === "document" ? "&#128196;" : "&#128193;"}
                                </span>
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
                                    ? `${label} for ${subject} (${item.details.caseNumber}).`
                                    : `${label} for ${subject}.`}
                                </p>
                                <span className="activity-user">
                                  {item.userName ||
                                    item.userUsername ||
                                    (item.userId != null
                                      ? `User #${item.userId}`
                                      : "System")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
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
