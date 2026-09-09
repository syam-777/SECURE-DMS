import { NavLink, useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";

function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}");
  } catch {
    return {};
  }
}

function AppLayout({ children }) {
  const navigate = useNavigate();

  const user = getUser();
  const role =
    typeof user.role === "string" ? user.role.toUpperCase() : "";

  const displayName =
    user.full_name ||
    user.fullName ||
    user.username ||
    user.email ||
    "User";

  const handleLogout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST" });
    } catch {
      // Logout is best-effort; the client discards the token either way.
    } finally {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      navigate("/login");
    }
  };

  const itemClass = ({ isActive }) =>
    "sidebar-item" + (isActive ? " active" : "");

  const navItems = [
    { to: "/dashboard", label: "Dashboard" },
    ...(role === "REVIEWER"
      ? [
          { to: "/reviewer-dashboard", label: "Reviewer Dashboard" },
          { to: "/review-queue", label: "Review Queue" },
        ]
      : []),
    { to: "/cases", label: "Cases" },
    { to: "/documents", label: "Documents" },
    ...(role !== "USER" ? [{ to: "/ai-assistant", label: "AI Assistant" }] : []),
    { to: "/search", label: "Search" },
    ...(role === "ADMIN" ? [{ to: "/audit-logs", label: "Audit Logs" }] : []),
    ...(role === "ADMIN" || role === "USER"
      ? [{ to: "/verifications", label: "Officer Verification" }]
      : []),
    ...(role === "ADMIN" ? [{ to: "/users", label: "User Management" }] : []),
  ];

  return (
    <>
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
            <span className="user-avatar">
              {displayName.charAt(0).toUpperCase()}
            </span>

            <span className="user-name">{displayName}</span>
          </div>

          <button className="logout-button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <div className="dashboard-body">
        <aside className="sidebar">
          {navItems.map((item) => (
            <NavLink key={item.to} className={itemClass} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </aside>

        <main className="main-content">{children}</main>
      </div>
    </>
  );
}

export default AppLayout;