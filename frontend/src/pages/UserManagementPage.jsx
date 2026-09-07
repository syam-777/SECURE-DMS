import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import AppLayout from "../components/AppLayout";
import "./UserManagementPage.css";

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

function UserManagementPage() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "USER",
  });
  const [formErrors, setFormErrors] = useState({});
  const [creating, setCreating] = useState(false);

  const [toasts, setToasts] = useState([]);

  const getCurrentUser = () => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  };

  const currentUser = getCurrentUser();
  const isAdmin = resolveUserRole(currentUser) === "ADMIN";

  const showToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");

      const data = await apiFetch("/users");

      if (!data.success) {
        throw new Error(data.message || "Failed to load users");
      }

      setUsers(data.users || data.data || []);
    } catch (err) {
      console.error("Users loading error:", err);
      if (err.status === 401 || err.status === 403) {
        setError(
          err.status === 403
            ? "You do not have permission to view users."
            : "Session expired. Please log in again."
        );
        if (err.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login");
        }
      } else {
        setError(err.message || "Failed to load users");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleCreateNew = () => {
    setFormData({
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      role: "USER",
    });
    setFormErrors({});
    setIsModalOpen(true);
  };

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
    if (!formData.email.trim()) {
      errors.email = "Email is required.";
    }
    if (!formData.password) {
      errors.password = "Password is required.";
    } else if (formData.password.length < 6) {
      errors.password = "Password must be at least 6 characters.";
    }
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Passwords do not match.";
    }
    if (!selectableRoles.includes(formData.role)) {
      errors.role = "Invalid role selected.";
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

    setCreating(true);
    try {
      const data = await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          fullName: formData.fullName.trim(),
          email: formData.email.trim(),
          password: formData.password,
          role: formData.role,
        }),
      });

      if (!data.success) {
        throw new Error(data.message || "Failed to create user");
      }

      showToast("User created successfully.");
      setIsModalOpen(false);
      loadUsers();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        showToast(
          err.status === 403
            ? "You do not have permission to create users."
            : "Session expired. Please log in again.",
          "error"
        );
        if (err.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login");
        }
      } else {
        setFormErrors({ general: err.message || "Failed to create user" });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (userId === currentUser.id || userId === currentUser._id) {
      showToast("You cannot change your own role.", "error");
      return;
    }

    try {
      const data = await apiFetch(`/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });

      if (!data.success) {
        throw new Error(data.message || "Failed to update role");
      }

      showToast("Role updated successfully.");
      loadUsers();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        showToast(
          err.status === 403
            ? "You do not have permission to change roles."
            : "Session expired. Please log in again.",
          "error"
        );
        if (err.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login");
        }
      } else {
        showToast(err.message || "Failed to update role", "error");
      }
    }
  };

  const handleToggleActive = async (user) => {
    const isSelf =
      (user.id != null &&
        currentUser.id != null &&
        String(user.id) === String(currentUser.id)) ||
      (user._id != null &&
        currentUser._id != null &&
        String(user._id) === String(currentUser._id));

    if (isSelf && isUserActive(user)) {
      showToast("You cannot deactivate your own account.", "error");
      return;
    }

    const endpoint = isUserActive(user)
      ? `/users/${user.id || user._id}/deactivate`
      : `/users/${user.id || user._id}/activate`;

    try {
      const data = await apiFetch(endpoint, { method: "PATCH" });

      if (!data.success) {
        throw new Error(
          data.message ||
            `Failed to ${isUserActive(user) ? "deactivate" : "activate"} user`
        );
      }

      showToast(
        `User ${isUserActive(user) ? "deactivated" : "activated"} successfully.`
      );
      loadUsers();
    } catch (err) {
      if (err.status === 401 || err.status === 403) {
        showToast(
          err.status === 403
            ? "You do not have permission to modify users."
            : "Session expired. Please log in again.",
          "error"
        );
        if (err.status === 401) {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
          navigate("/login");
        }
      } else {
        showToast(err.message || "Failed to update user status", "error");
      }
    }
  };

  const getUserRole = (user) => {
    return resolveUserRole(user);
  };

  const filteredUsers = users.filter((user) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (user.username || "").toLowerCase().includes(term) ||
      (user.full_name || user.fullName || "").toLowerCase().includes(term) ||
      (user.email || "").toLowerCase().includes(term) ||
      getUserRole(user).toLowerCase().includes(term)
    );
  });

  const isUserActive = (user) => {
    return Boolean(user.isActive ?? user.active ?? user.is_active ?? true);
  };

  const isSelf = (user) => {
    const userId = user.id || user._id;
    const currentId = currentUser.id || currentUser._id;
    if (userId != null && currentId != null && String(userId) === String(currentId)) {
      return true;
    }
    if (user.email && currentUser.email && user.email === currentUser.email) {
      return true;
    }
    return false;
  };

  if (loading) {
    return (
      <div className="user-management-page">
        <AppLayout>
            <p>Loading users...</p>
        </AppLayout>
    </div>
    );
  }

  if (error) {
    return (
      <div className="user-management-page">
        <AppLayout>
            <h1 className="page-title">User Management</h1>
            <p className="page-description">Unable to load users.</p>
            <p className="form-error">{error}</p>
            <button className="create-button" onClick={loadUsers}>
              Try Again
            </button>
        </AppLayout>
    </div>
    );
  }

  return (
    <div className="user-management-page">
      <AppLayout>
          <div className="page-heading">
            <h1 className="page-title">User Management</h1>
            <p className="page-description">
              Manage system users, roles, and account status.
            </p>
          </div>

          <div className="toolbar">
            <button className="create-button" onClick={handleCreateNew}>
              + Create User
            </button>

            <input
              type="text"
              className="search-input"
              placeholder="Search users by name, email, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="table-section">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Full Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((user) => {
                    const userId = user.id || user._id;
                    const role = getUserRole(user);
                    const userIsSelf = isSelf(user);

                    return (
                      <tr
                        key={userId}
                        style={
                          !isUserActive(user)
                            ? { opacity: 0.6 }
                            : undefined
                        }
                      >
                        <td>{user.username || "—"}</td>
                        <td>
                          {user.full_name ||
                            user.fullName ||
                            "—"}
                        </td>
                        <td>{user.email || "—"}</td>
                        <td>
                          {userIsSelf || !isAdmin ? (
                            <span
                              className={`role-badge role-${role.toLowerCase()}`}
                            >
                              {role}
                            </span>
                          ) : (
                            <select
                              className="inline-role-select"
                              value={role}
                              onChange={(e) =>
                                handleRoleChange(
                                  userId,
                                  e.target.value
                                )
                              }
                            >
                              {selectableRoles.includes(role)
                                ? selectableRoles.map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))
                                : [role, ...selectableRoles].map((r) => (
                                    <option key={r} value={r}>
                                      {r}
                                    </option>
                                  ))}
                            </select>
                          )}
                        </td>
                        <td>
                          <span
                            className={`status-badge ${
                              isUserActive(user)
                                ? "status-active"
                                : "status-inactive"
                            }`}
                          >
                            {isUserActive(user) ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <div className="action-cell">
                            {userIsSelf ? (
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#94a3b8",
                                }}
                              >
                                Current user
                              </span>
                            ) : isAdmin ? (
                              isUserActive(user) ? (
                                <button
                                  className="action-button danger"
                                  onClick={() =>
                                    handleToggleActive(user)
                                  }
                                >
                                  Deactivate
                                </button>
                              ) : (
                                <button
                                  className="action-button success"
                                  onClick={() =>
                                    handleToggleActive(user)
                                  }
                                >
                                  Activate
                                </button>
                              )
                            ) : (
                              <span
                                style={{
                                  fontSize: "12px",
                                  color: "#94a3b8",
                                }}
                              >
                                —
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="6" className="no-results">
                      {searchTerm
                        ? "No users match your search."
                        : "No users found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
      </AppLayout>

      {isModalOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsModalOpen(false);
            }
          }}
        >
          <div className="modal-content">
            <div className="modal-header">
              <div>
                <h2 className="modal-title">Create New User</h2>
                <p className="modal-subtitle">
                  Fill in the details below to add a new user to the
                  system.
                </p>
              </div>
              <button
                className="modal-close"
                onClick={() => setIsModalOpen(false)}
              >
                &times;
              </button>
            </div>

            {formErrors.general && (
              <p className="form-error" style={{ marginBottom: 16 }}>
                {formErrors.general}
              </p>
            )}

            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">
                  Full Name{" "}
                  <span className="required-mark">*</span>
                </label>
                <input
                  type="text"
                  className={
                    "form-input" +
                    (formErrors.fullName ? " has-error" : "")
                  }
                  name="fullName"
                  placeholder="John Doe"
                  value={formData.fullName}
                  onChange={handleChange}
                />
                {formErrors.fullName && (
                  <span className="form-error">
                    {formErrors.fullName}
                  </span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Email{" "}
                  <span className="required-mark">*</span>
                </label>
                <input
                  type="email"
                  className={
                    "form-input" +
                    (formErrors.email ? " has-error" : "")
                  }
                  name="email"
                  placeholder="user@example.com"
                  value={formData.email}
                  onChange={handleChange}
                />
                {formErrors.email && (
                  <span className="form-error">
                    {formErrors.email}
                  </span>
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">
                    Password{" "}
                    <span className="required-mark">*</span>
                  </label>
                  <input
                    type="password"
                    className={
                      "form-input" +
                      (formErrors.password ? " has-error" : "")
                    }
                    name="password"
                    placeholder="At least 6 characters"
                    value={formData.password}
                    onChange={handleChange}
                  />
                  {formErrors.password && (
                    <span className="form-error">
                      {formErrors.password}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Confirm Password{" "}
                    <span className="required-mark">*</span>
                  </label>
                  <input
                    type="password"
                    className={
                      "form-input" +
                      (formErrors.confirmPassword
                        ? " has-error"
                        : "")
                    }
                    name="confirmPassword"
                    placeholder="Re-enter password"
                    value={formData.confirmPassword}
                    onChange={handleChange}
                  />
                  {formErrors.confirmPassword && (
                    <span className="form-error">
                      {formErrors.confirmPassword}
                    </span>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Role <span className="required-mark">*</span>
                </label>
                <select
                  className="form-select"
                  name="role"
                  value={formData.role}
                  onChange={handleChange}
                >
                  {selectableRoles.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {formErrors.role && (
                  <span className="form-error">
                    {formErrors.role}
                  </span>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="submit-button"
                  disabled={creating}
                >
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

export default UserManagementPage;
