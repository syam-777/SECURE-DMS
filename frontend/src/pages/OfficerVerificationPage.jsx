import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./OfficerVerificationPage.css";

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

function formatDate(value) {
  if (!value) {
    return "—";
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return date.toLocaleString();
  } catch {
    return "—";
  }
}

function VerificationDetails({ verification }) {
  return (
    <div className="verification-details">
      <div className="info-row">
        <span className="info-label">Full Name</span>
        <span className="info-value">{verification.fullName || "—"}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Official ID Type</span>
        <span className="info-value">{verification.officialIdType || "—"}</span>
      </div>
      <div className="info-row">
        <span className="info-label">Official ID (Last 4)</span>
        <span className="info-value">
          {verification.officialIdLast4
            ? `•••• ${verification.officialIdLast4}`
            : "—"}
        </span>
      </div>
      <div className="info-row">
        <span className="info-label">Submitted</span>
        <span className="info-value">{formatDate(verification.submittedAt)}</span>
      </div>
      {verification.reviewedAt && (
        <div className="info-row">
          <span className="info-label">Reviewed</span>
          <span className="info-value">{formatDate(verification.reviewedAt)}</span>
        </div>
      )}
      {verification.reviewNote && (
        <div className="info-row">
          <span className="info-label">Review Note</span>
          <span className="info-value">{verification.reviewNote}</span>
        </div>
      )}
    </div>
  );
}

function UserVerificationView({ showToast, handleAuthError }) {
  const [myVerification, setMyVerification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formData, setFormData] = useState({
    fullName: "",
    officialIdType: "",
    officialIdNumber: "",
  });
  const [formErrors, setFormErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const loadMyVerification = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await apiFetch("/verifications/me");
      setMyVerification(data.verification || null);
    } catch (err) {
      if (err.status === 404) {
        setMyVerification(null);
      } else if (
        !handleAuthError(
          err,
          "You do not have permission to view verification requests."
        )
      ) {
        setLoadError(err.message || "Failed to load your verification status.");
      }
    } finally {
      setLoading(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    loadMyVerification();
  }, [loadMyVerification]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setFormErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validate = () => {
    const errors = {};
    if (!formData.fullName.trim()) {
      errors.fullName = "Full name is required.";
    }
    if (!formData.officialIdType.trim()) {
      errors.officialIdType = "Official ID type is required.";
    }
    if (!formData.officialIdNumber.trim()) {
      errors.officialIdNumber = "Official ID number is required.";
    } else if (formData.officialIdNumber.trim().length < 4) {
      errors.officialIdNumber =
        "Official ID number must be at least 4 characters.";
    }
    return errors;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const errors = validate();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const data = await apiFetch("/verifications", {
        method: "POST",
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          officialIdType: formData.officialIdType.trim(),
          officialIdNumber: formData.officialIdNumber.trim(),
        }),
      });

      if (!data.success) {
        throw new Error(data.message || "Failed to submit verification request");
      }

      setMyVerification(data.verification || { status: "pending" });
      setFormErrors({});
      showToast("Verification request submitted successfully.");
    } catch (err) {
      if (err.status === 409) {
        showToast(
          err.message || "Verification request could not be submitted.",
          "error"
        );
        loadMyVerification();
      } else if (
        !handleAuthError(
          err,
          "You do not have permission to submit a verification request."
        )
      ) {
        setFormErrors({
          general: err.message || "Failed to submit verification request",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = () => (
    <form onSubmit={handleSubmit}>
      {formErrors.general && (
        <p className="form-error" style={{ marginBottom: 16 }}>
          {formErrors.general}
        </p>
      )}

      <div className="form-group">
        <label className="form-label">
          Full Name <span className="required-mark">*</span>
        </label>
        <input
          type="text"
          className={
            "form-input" + (formErrors.fullName ? " has-error" : "")
          }
          name="fullName"
          placeholder="John Doe"
          value={formData.fullName}
          onChange={handleChange}
        />
        {formErrors.fullName && (
          <span className="form-error">{formErrors.fullName}</span>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">
          Official ID Type <span className="required-mark">*</span>
        </label>
        <input
          type="text"
          className={
            "form-input" +
            (formErrors.officialIdType ? " has-error" : "")
          }
          name="officialIdType"
          placeholder="e.g. Passport, Driver's License, National ID"
          value={formData.officialIdType}
          onChange={handleChange}
        />
        {formErrors.officialIdType && (
          <span className="form-error">{formErrors.officialIdType}</span>
        )}
      </div>

      <div className="form-group">
        <label className="form-label">
          Official ID Number <span className="required-mark">*</span>
        </label>
        <input
          type="text"
          className={
            "form-input" +
            (formErrors.officialIdNumber ? " has-error" : "")
          }
          name="officialIdNumber"
          placeholder="e.g. A1234567"
          value={formData.officialIdNumber}
          onChange={handleChange}
        />
        {formErrors.officialIdNumber && (
          <span className="form-error">{formErrors.officialIdNumber}</span>
        )}
      </div>

      <div className="form-actions">
        <button
          type="submit"
          className="submit-button"
          disabled={submitting}
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </form>
  );

  if (loading) {
    return (
      <div className="verification-card">
        <h2>Verification Status</h2>
        <p className="no-results" style={{ margin: 0, padding: 8 }}>
          Loading your verification status...
        </p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="verification-card">
        <h2>Verification Status</h2>
        <p className="form-error" style={{ marginBottom: 16 }}>
          {loadError}
        </p>
        <button className="submit-button" onClick={loadMyVerification}>
          Try Again
        </button>
      </div>
    );
  }

  if (myVerification) {
    const status = (myVerification.status || "").toLowerCase();

    if (status === "pending") {
      return (
        <div className="verification-card">
          <h2>Verification Status</h2>
          <p className="card-subtitle">
            Your request is currently being reviewed.
          </p>
          <div className="status-banner status-banner-pending">
            <div className="status-banner-title">&#9203; Pending Review</div>
            <p>
              Your officer verification request is under review. You will not
              be able to submit another request until this one is resolved.
            </p>
          </div>
          <VerificationDetails verification={myVerification} />
        </div>
      );
    }

    if (status === "approved") {
      return (
        <div className="verification-card">
          <h2>Verification Status</h2>
          <p className="card-subtitle">Your request has been approved.</p>
          <div className="status-banner status-banner-approved">
            <div className="status-banner-title">&#9989; Approved</div>
            <p>
              Your identity has been verified and your account has been
              granted the OFFICER role.
            </p>
          </div>
          <VerificationDetails verification={myVerification} />
        </div>
      );
    }

    if (status === "rejected") {
      return (
        <div className="verification-card">
          <h2>Verification Status</h2>
          <p className="card-subtitle">
            Your request was not approved. You may submit a new request below.
          </p>
          <div className="status-banner status-banner-rejected">
            <div className="status-banner-title">&#10060; Rejected</div>
            {myVerification.reviewNote ? (
              <p>
                <strong>Review note:</strong> {myVerification.reviewNote}
              </p>
            ) : (
              <p>No review note was provided.</p>
            )}
          </div>
          <VerificationDetails verification={myVerification} />
          {renderForm()}
        </div>
      );
    }

    return (
      <div className="verification-card">
        <h2>Verification Status</h2>
        <div className="status-banner status-banner-general">
          <div className="status-banner-title">
            Status: {status || "Unknown"}
          </div>
        </div>
        <VerificationDetails verification={myVerification} />
      </div>
    );
  }

  return (
    <div className="verification-card">
      <h2>Request Officer Verification</h2>
      <p className="card-subtitle">
        Fill in the details below to request the OFFICER role. Your official
        ID number is stored securely and is never displayed in full.
      </p>
      {renderForm()}
    </div>
  );
}

function AdminVerificationView({ showToast, handleAuthError }) {
  const [verifications, setVerifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [actionTarget, setActionTarget] = useState(null);
  const [actionType, setActionType] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewNoteError, setReviewNoteError] = useState("");
  const [actionSubmitting, setActionSubmitting] = useState(false);

  const loadVerifications = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (statusFilter) {
        params.set("status", statusFilter);
      }
      const data = await apiFetch(`/verifications?${params.toString()}`);

      if (!data.success) {
        throw new Error(
          data.message || "Failed to load verification requests"
        );
      }

      setVerifications(data.verifications || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      if (
        !handleAuthError(
          err,
          "You do not have permission to view verification requests."
        )
      ) {
        setLoadError(err.message || "Failed to load verification requests");
      }
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter, handleAuthError]);

  useEffect(() => {
    loadVerifications();
  }, [loadVerifications]);

  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(1);
  };

  const openApproveModal = (verification) => {
    setActionTarget(verification);
    setActionType("approve");
    setReviewNote("");
    setReviewNoteError("");
  };

  const openRejectModal = (verification) => {
    setActionTarget(verification);
    setActionType("reject");
    setReviewNote("");
    setReviewNoteError("");
  };

  const closeActionModal = () => {
    if (actionSubmitting) {
      return;
    }
    setActionTarget(null);
    setActionType(null);
    setReviewNote("");
    setReviewNoteError("");
  };

  const handleReviewNoteChange = (event) => {
    setReviewNote(event.target.value);
    setReviewNoteError("");
  };

  const submitAction = async () => {
    if (!actionTarget || !actionType) {
      return;
    }
    if (actionType === "reject" && !reviewNote.trim()) {
      setReviewNoteError("A review note is required to reject a request.");
      return;
    }

    setActionSubmitting(true);
    try {
      const body = {};
      if (reviewNote.trim()) {
        body.reviewNote = reviewNote.trim();
      }

      const data = await apiFetch(
        `/verifications/${actionTarget.id}/${actionType}`,
        {
          method: "PATCH",
          body: JSON.stringify(body),
        }
      );

      if (!data.success) {
        throw new Error(data.message || `Failed to ${actionType} the request`);
      }

      showToast(
        `Request ${
          actionType === "approve" ? "approved" : "rejected"
        } successfully.`
      );
      setActionTarget(null);
      setActionType(null);
      setReviewNote("");
      setReviewNoteError("");
      loadVerifications();
    } catch (err) {
      if (
        !handleAuthError(
          err,
          `You do not have permission to ${actionType} verification requests.`
        )
      ) {
        setReviewNoteError(
          err.message || `Failed to ${actionType} the request`
        );
      }
    } finally {
      setActionSubmitting(false);
    }
  };

  return (
    <>
      <div className="toolbar">
        <select
          className="filter-select"
          value={statusFilter}
          onChange={handleStatusFilterChange}
        >
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <span className="pagination-info">
          {total} request{total === 1 ? "" : "s"}
        </span>
      </div>

      {loadError && (
        <div
          className="verification-card"
          style={{ marginBottom: 16, maxWidth: "none" }}
        >
          <p className="form-error" style={{ marginBottom: 16 }}>
            {loadError}
          </p>
          <button className="submit-button" onClick={loadVerifications}>
            Try Again
          </button>
        </div>
      )}

      <div className="table-section">
        {loading ? (
          <p className="no-results">Loading verification requests...</p>
        ) : verifications.length === 0 ? (
          <p className="no-results">No verification requests found.</p>
        ) : (
          <table className="verifications-table">
            <thead>
              <tr>
                <th>Applicant</th>
                <th>Email</th>
                <th>ID Type</th>
                <th>ID (Last 4)</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Review Info</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {verifications.map((verification) => {
                const isPending =
                  (verification.status || "").toLowerCase() === "pending";
                const status =
                  (verification.status || "").toLowerCase() || "pending";
                return (
                  <tr key={verification.id}>
                    <td>
                      <div className="applicant-name">
                        {verification.userFullName ||
                          verification.username ||
                          "—"}
                      </div>
                      {verification.username &&
                        verification.username !==
                          verification.userFullName && (
                          <div className="applicant-email">
                            @{verification.username}
                          </div>
                        )}
                    </td>
                    <td className="applicant-email">
                      {verification.userEmail || "—"}
                    </td>
                    <td>{verification.officialIdType || "—"}</td>
                    <td>
                      {verification.officialIdLast4
                        ? `•••• ${verification.officialIdLast4}`
                        : "—"}
                    </td>
                    <td>
                      <span className={`status-badge status-${status}`}>
                        {status.toUpperCase()}
                      </span>
                    </td>
                    <td>{formatDate(verification.submittedAt)}</td>
                    <td>
                      {verification.reviewedAt ? (
                        <div>
                          {verification.reviewNote && (
                            <div className="review-note">
                              {verification.reviewNote}
                            </div>
                          )}
                          <div className="review-meta">
                            {formatDate(verification.reviewedAt)}
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <div className="action-cell">
                        {isPending ? (
                          <>
                            <button
                              className="action-button success"
                              onClick={() => openApproveModal(verification)}
                            >
                              Approve
                            </button>
                            <button
                              className="action-button danger"
                              onClick={() => openRejectModal(verification)}
                            >
                              Reject
                            </button>
                          </>
                        ) : (
                          "—"
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="pagination">
        <span className="pagination-info">
          Page {page} of {totalPages} &middot; {total} total
        </span>
        <button
          className="pagination-button"
          disabled={page <= 1 || loading}
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
        >
          Prev
        </button>
        <button
          className="pagination-button"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((prev) => prev + 1)}
        >
          Next
        </button>
      </div>

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
                    ? "Approve Request"
                    : "Reject Request"}
                </h2>
                <p className="modal-subtitle">
                  {actionTarget.userFullName || actionTarget.username ? (
                    `Reviewing the request from ${
                      actionTarget.userFullName || actionTarget.username
                    }.`
                  ) : (
                    <>Reviewing this verification request.</>
                  )}{" "}
                  {actionType === "reject"
                    ? "A review note is required."
                    : "A review note is optional."}
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
                {actionType === "reject" && (
                  <span className="required-mark">*</span>
                )}
              </label>
              <textarea
                className={
                  "form-input" +
                  (reviewNoteError ? " has-error" : "")
                }
                value={reviewNote}
                onChange={handleReviewNoteChange}
                placeholder={
                  actionType === "reject"
                    ? "Required — explain why this request is being rejected."
                    : "Optional note for the applicant."
                }
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
                  (actionType === "reject" ? " reject-button" : "")
                }
                onClick={submitAction}
                disabled={actionSubmitting}
              >
                {actionSubmitting
                  ? "Processing..."
                  : actionType === "approve"
                  ? "Approve"
                  : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AlreadyVerifiedView() {
  return (
    <div className="notice-card">
      <h2>Already Verified</h2>
      <p>
        Your account already has the OFFICER role, so no further verification
        is required. If you need help, please contact a system administrator.
      </p>
    </div>
  );
}

function NotPermittedView() {
  return (
    <div className="notice-card">
      <h2>No Access</h2>
      <p>
        You do not have permission to view or manage officer verification
        requests. Please contact a system administrator if you believe this
        is a mistake.
      </p>
    </div>
  );
}

function OfficerVerificationPage() {
  const navigate = useNavigate();

  const getCurrentUser = () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  };

  const currentUser = getCurrentUser();
  const role = resolveUserRole(currentUser);

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

  let content;
  if (role === "ADMIN") {
    content = (
      <AdminVerificationView
        showToast={showToast}
        handleAuthError={handleAuthError}
      />
    );
  } else if (role === "OFFICER") {
    content = <AlreadyVerifiedView />;
  } else if (role === "USER") {
    content = (
      <UserVerificationView
        showToast={showToast}
        handleAuthError={handleAuthError}
      />
    );
  } else {
    content = <NotPermittedView />;
  }

  return (
    <div className="officer-verification-page">
      <AppLayout>
          <div className="page-heading">
            <h1 className="page-title">Officer Verification</h1>
            <p className="page-description">
              Submit and manage OFFICER role verification requests.
            </p>
          </div>
          {content}
      </AppLayout>

      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast toast-${toast.type}`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default OfficerVerificationPage;