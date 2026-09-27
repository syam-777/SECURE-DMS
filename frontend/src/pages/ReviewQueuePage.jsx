import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./ReviewQueuePage.css";

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-IN");
  } catch {
    return "—";
  }
}

function titleCase(value) {
  if (!value) return "—";
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function ReviewQueuePage() {
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState("cases");

  const [cases, setCases] = useState([]);
  const [caseTotal, setCaseTotal] = useState(0);
  const [casePage, setCasePage] = useState(1);
  const [casePages, setCasePages] = useState(1);
  const [caseLoading, setCaseLoading] = useState(true);
  const [caseError, setCaseError] = useState("");

  const [documents, setDocuments] = useState([]);
  const [docTotal, setDocTotal] = useState(0);
  const [docPage, setDocPage] = useState(1);
  const [docPages, setDocPages] = useState(1);
  const [docLoading, setDocLoading] = useState(true);
  const [docError, setDocError] = useState("");

  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [actionKind, setActionKind] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewNoteError, setReviewNoteError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const [toasts, setToasts] = useState([]);

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const handleAuthError = useCallback(
    (err, permissionMessage) => {
      if (err.status !== 401 && err.status !== 403) {
        return false;
      }
      if (err.status === 403) {
        showToast(permissionMessage, "error");
      } else {
        showToast("Session expired. Please log in again.", "error");
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login");
      }
      return true;
    },
    [navigate, showToast]
  );

  const loadCases = useCallback(async () => {
    setCaseLoading(true);
    setCaseError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(casePage));
      params.set("limit", "20");
      const data = await apiFetch(`/reviews/cases?${params.toString()}`);
      if (!data.success) {
        throw new Error(data.message || "Failed to load review cases");
      }
      setCases(data.cases || []);
      setCaseTotal(data.total || 0);
      setCasePages(data.totalPages || 1);
    } catch (err) {
      if (
        !handleAuthError(
          err,
          "You do not have permission to view the review queue."
        )
      ) {
        setCaseError(err.message || "Failed to load review cases");
      }
    } finally {
      setCaseLoading(false);
    }
  }, [casePage, handleAuthError]);

  const loadDocuments = useCallback(async () => {
    setDocLoading(true);
    setDocError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(docPage));
      params.set("limit", "20");
      const data = await apiFetch(`/reviews/documents?${params.toString()}`);
      if (!data.success) {
        throw new Error(data.message || "Failed to load review documents");
      }
      setDocuments(data.documents || []);
      setDocTotal(data.total || 0);
      setDocPages(data.totalPages || 1);
    } catch (err) {
      if (
        !handleAuthError(
          err,
          "You do not have permission to view the review queue."
        )
      ) {
        setDocError(err.message || "Failed to load review documents");
      }
    } finally {
      setDocLoading(false);
    }
  }, [docPage, handleAuthError]);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const openAction = (kind, target, type) => {
    setActionKind(kind);
    setActionTarget(target);
    setActionType(type);
    setReviewNote("");
    setReviewNoteError("");
  };

  const closeActionModal = () => {
    if (actionSubmitting) return;
    setActionKind(null);
    setActionTarget(null);
    setActionType(null);
    setReviewNote("");
    setReviewNoteError("");
  };

  const submitAction = async () => {
    if (!actionTarget || !actionType || !actionKind) return;
    if (actionType !== "approve" && !reviewNote.trim()) {
      setReviewNoteError(
        "A review note is required for this action."
      );
      return;
    }

    setActionSubmitting(true);
    try {
      const body = {};
      if (reviewNote.trim()) {
        body.reviewNote = reviewNote.trim();
      }

      const data = await apiFetch(
        `/reviews/${actionKind}s/${actionTarget.id}/${actionType}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );

      if (!data.success) {
        throw new Error(
          data.message || `Failed to ${actionType} the ${actionKind}`
        );
      }

      showToast(
        `${actionKind.charAt(0).toUpperCase() + actionKind.slice(1)} ${
          actionType === "approve" ? "approved" : actionType
        } successfully.`
      );
      setActionKind(null);
      setActionTarget(null);
      setActionType(null);
      setReviewNote("");
      setReviewNoteError("");
      loadCases();
      loadDocuments();
    } catch (err) {
      if (
        !handleAuthError(
          err,
          `You do not have permission to ${actionType} ${actionKind}s.`
        )
      ) {
        setReviewNoteError(
          err.message || `Failed to ${actionType} the ${actionKind}`
        );
      }
    } finally {
      setActionSubmitting(false);
    }
  };

  const getReviewNote = (item) => {
    if (!item.last_review_note) return null;
    return (
      <div className="review-note">
        <strong>Last note:</strong> {item.last_review_note}
      </div>
    );
  };

  return (
    <div className="review-queue-page">
      <AppLayout>
          <div className="page-heading">
            <h1 className="page-title">Review Queue</h1>
            <p className="page-description">
              Review cases and documents pending your approval, rejection, or
              return for revision.
            </p>
          </div>

          <div className="tabs">
            <button
              className={`tab ${activeTab === "cases" ? "active" : ""}`}
              onClick={() => setActiveTab("cases")}
            >
              Cases ({caseTotal})
            </button>
            <button
              className={`tab ${activeTab === "documents" ? "active" : ""}`}
              onClick={() => setActiveTab("documents")}
            >
              Documents ({docTotal})
            </button>
          </div>

          {activeTab === "cases" && (
            <div className="table-section">
              {caseError && (
                <div className="review-error">
                  <p>{caseError}</p>
                  <button onClick={loadCases}>Try Again</button>
                </div>
              )}

              {caseLoading ? (
                <div className="no-results">Loading cases...</div>
              ) : cases.length === 0 ? (
                <div className="no-results">
                  No cases are currently awaiting review.
                </div>
              ) : (
                <>
                  <table className="review-table">
                    <thead>
                      <tr>
                        <th>Case ID</th>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assigned Officer</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.map((caseItem) => {
                        const isPending =
                          caseItem.status === "under_review" ||
                          caseItem.status === "returned";
                        return (
                          <tr key={caseItem.id}>
                            <td className="case-id">
                              {caseItem.case_number || caseItem.id}
                            </td>
                            <td>
                              <div className="name-cell">
                                {caseItem.title}
                                {getReviewNote(caseItem)}
                              </div>
                            </td>
                            <td>{caseItem.case_type || "—"}</td>
                            <td>
                              <span
                                className={`status-badge status-${String(
                                  caseItem.status || "unknown"
                                ).toLowerCase()}`}
                              >
                                {titleCase(caseItem.status)}
                              </span>
                            </td>
                            <td>
                              <span
                                className={`priority-badge priority-${String(
                                  caseItem.priority || "low"
                                ).toLowerCase()}`}
                              >
                                {titleCase(caseItem.priority)}
                              </span>
                            </td>
                            <td>
                              {caseItem.assignee_name ||
                                caseItem.assignee_username ||
                                "Unassigned"}
                            </td>
                            <td>{formatDate(caseItem.updated_at)}</td>
                            <td>
                              <div className="action-cell">
                                <Link
                                  className="view-button"
                                  to={`/case-details/${caseItem.id}`}
                                >
                                  View
                                </Link>
                                {isPending && (
                                  <>
                                    <button
                                      className="action-button success"
                                      onClick={() =>
                                        openAction(
                                          "case",
                                          caseItem,
                                          "approve"
                                        )
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      className="action-button warning"
                                      onClick={() =>
                                        openAction(
                                          "case",
                                          caseItem,
                                          "return"
                                        )
                                      }
                                    >
                                      Return
                                    </button>
                                    <button
                                      className="action-button danger"
                                      onClick={() =>
                                        openAction(
                                          "case",
                                          caseItem,
                                          "reject"
                                        )
                                      }
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="pagination">
                    <span className="pagination-info">
                      Page {casePage} of {casePages} &middot; {caseTotal} total
                    </span>
                    <button
                      className="pagination-button"
                      disabled={casePage <= 1 || caseLoading}
                      onClick={() =>
                        setCasePage((prev) => Math.max(1, prev - 1))
                      }
                    >
                      Prev
                    </button>
                    <button
                      className="pagination-button"
                      disabled={casePage >= casePages || caseLoading}
                      onClick={() =>
                        setCasePage((prev) => prev + 1)
                      }
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === "documents" && (
            <div className="table-section">
              {docError && (
                <div className="review-error">
                  <p>{docError}</p>
                  <button onClick={loadDocuments}>Try Again</button>
                </div>
              )}

              {docLoading ? (
                <div className="no-results">Loading documents...</div>
              ) : documents.length === 0 ? (
                <div className="no-results">
                  No documents are currently awaiting review.
                </div>
              ) : (
                <>
                  <table className="review-table">
                    <thead>
                      <tr>
                        <th>Document ID</th>
                        <th>Title</th>
                        <th>Type</th>
                        <th>Case</th>
                        <th>Uploaded By</th>
                        <th>Version</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => {
                        const isPending = doc.status === "pending_review";
                        return (
                          <tr key={doc.id}>
                            <td className="case-id">DOC-{doc.id}</td>
                            <td>
                              <div className="name-cell">
                                {doc.title}
                                {getReviewNote(doc)}
                              </div>
                            </td>
                            <td>{doc.document_type || "—"}</td>
                            <td>{doc.case_number || "—"}</td>
                            <td>
                              {doc.uploader_name ||
                                doc.uploader_username ||
                                "—"}
                            </td>
                            <td>{doc.current_version}</td>
                            <td>
                              <span
                                className={`status-badge status-${String(
                                  doc.status || "unknown"
                                ).toLowerCase()}`}
                              >
                                {titleCase(doc.status)}
                              </span>
                            </td>
                            <td>
                              <div className="action-cell">
                                <Link
                                  className="view-button"
                                  to={`/document-details/${doc.id}`}
                                >
                                  View
                                </Link>
                                {isPending && (
                                  <>
                                    <button
                                      className="action-button success"
                                      onClick={() =>
                                        openAction(
                                          "document",
                                          doc,
                                          "approve"
                                        )
                                      }
                                    >
                                      Approve
                                    </button>
                                    <button
                                      className="action-button warning"
                                      onClick={() =>
                                        openAction(
                                          "document",
                                          doc,
                                          "return"
                                        )
                                      }
                                    >
                                      Return
                                    </button>
                                    <button
                                      className="action-button danger"
                                      onClick={() =>
                                        openAction(
                                          "document",
                                          doc,
                                          "reject"
                                        )
                                      }
                                    >
                                      Reject
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="pagination">
                    <span className="pagination-info">
                      Page {docPage} of {docPages} &middot; {docTotal} total
                    </span>
                    <button
                      className="pagination-button"
                      disabled={docPage <= 1 || docLoading}
                      onClick={() =>
                        setDocPage((prev) => Math.max(1, prev - 1))
                      }
                    >
                      Prev
                    </button>
                    <button
                      className="pagination-button"
                      disabled={docPage >= docPages || docLoading}
                      onClick={() =>
                        setDocPage((prev) => prev + 1)
                      }
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
      </AppLayout>

      {actionTarget && actionType && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeActionModal();
            }
          }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">
                  {actionType === "approve"
                    ? `Approve ${actionKind}`
                    : actionType === "return"
                    ? `Return ${actionKind}`
                    : `Reject ${actionKind}`}
                </h2>
                <p className="modal-subtitle">
                  {actionType === "approve"
                    ? "Confirm your approval of this item."
                    : actionType === "return"
                    ? "Return this item for revision. A review note is required."
                    : "Reject this item. A review note is required."}
                </p>
              </div>
              <button
                className="modal-close"
                onClick={closeActionModal}
              >
                &times;
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">
                Review Note{" "}
                {actionType === "approve" ? (
                  <span className="optional-mark">(optional)</span>
                ) : (
                  <span className="required-mark">*</span>
                )}
              </label>
              <textarea
                className={
                  "form-input" + (reviewNoteError ? " has-error" : "")
                }
                value={reviewNote}
                onChange={(e) => {
                  setReviewNote(e.target.value);
                  setReviewNoteError("");
                }}
                placeholder={
                  actionType === "approve"
                    ? "Optional note for the record."
                    : "Required — explain the reason for this action."
                }
                rows={4}
              />
              {reviewNoteError && (
                <span className="form-error">{reviewNoteError}</span>
              )}
            </div>

            <div className="modal-actions">
              <button
                className="cancel-button"
                onClick={closeActionModal}
                disabled={actionSubmitting}
              >
                Cancel
              </button>
              <button
                className={
                  "submit-button" +
                  (actionType === "approve"
                    ? " approve-button"
                    : actionType === "return"
                    ? " return-button"
                    : " reject-button")
                }
                onClick={submitAction}
                disabled={actionSubmitting}
              >
                {actionSubmitting
                  ? "Processing..."
                  : actionType === "approve"
                  ? "Approve"
                  : actionType === "return"
                  ? "Return"
                  : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast-${toast.type}`}>
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ReviewQueuePage;
