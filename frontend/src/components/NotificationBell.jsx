import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../api/api";
import "./NotificationBell.css";

const POLL_INTERVAL_MS = 60 * 1000;
const PAGE_LIMIT = 20;

const TYPE_ICONS = {
  CASE_ASSIGNED: "\u2696\ufe0f",
  CASE_SUBMITTED_FOR_REVIEW: "\u{1F4DD}",
  CASE_APPROVED: "\u2705",
  CASE_REJECTED: "\u274C",
  CASE_RETURNED: "\u21A9\ufe0f",
  DOCUMENT_UPLOADED: "\u{1F4C4}",
  DOCUMENT_VERSION_CREATED: "\u{1F504}",
  INTEGRITY_CHECK_FAILED: "\u26A0\ufe0f",
  DOCUMENT_REVIEW_APPROVED: "\u2705",
  DOCUMENT_REVIEW_REJECTED: "\u274C",
  DOCUMENT_REVIEW_RETURNED: "\u21A9\ufe0f",
};

function typeIcon(type) {
  return TYPE_ICONS[type] || "\u{1F514}";
}

function relativeTime(iso) {
  if (!iso) {
    return "";
  }
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) {
    return "";
  }
  const diff = Date.now() - time;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(iso).toLocaleDateString();
}

function hasToken() {
  return Boolean(localStorage.getItem("token"));
}

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef(null);
  const statsAbortRef = useRef(null);
  const listAbortRef = useRef(null);

  const loadUnreadCount = useCallback(async (silent = true) => {
    if (!hasToken()) {
      return;
    }
    if (statsAbortRef.current) {
      statsAbortRef.current.abort();
    }
    const controller = new AbortController();
    statsAbortRef.current = controller;
    try {
      const data = await apiFetch("/notifications/unread-count", {
        signal: controller.signal,
      });
      if (data && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        setUnreadCount(0);
        return;
      }
      if (silent) {
        return;
      }
    } finally {
      if (statsAbortRef.current === controller) {
        statsAbortRef.current = null;
      }
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!hasToken()) {
      return;
    }
    if (listAbortRef.current) {
      listAbortRef.current.abort();
    }
    const controller = new AbortController();
    listAbortRef.current = controller;
    setLoading(true);
    try {
      const data = await apiFetch(
        `/notifications?page=1&limit=${PAGE_LIMIT}`,
        { signal: controller.signal }
      );
      if (data && Array.isArray(data.notifications)) {
        setNotifications(data.notifications);
        setTotal(typeof data.total === "number" ? data.total : data.notifications.length);
        if (typeof data.unreadCount === "number") {
          setUnreadCount(data.unreadCount);
        }
      }
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
    } finally {
      setLoading(false);
      if (listAbortRef.current === controller) {
        listAbortRef.current = null;
      }
    }
  }, []);

  useEffect(() => {
    if (!hasToken()) {
      return undefined;
    }
    loadUnreadCount(true);
    const interval = setInterval(() => {
      loadUnreadCount(true);
    }, POLL_INTERVAL_MS);

    const onFocus = () => {
      loadUnreadCount(true);
      if (openRef.current) {
        loadNotifications();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      if (statsAbortRef.current) {
        statsAbortRef.current.abort();
      }
      if (listAbortRef.current) {
        listAbortRef.current.abort();
      }
    };
  }, [loadUnreadCount, loadNotifications]);

  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    loadNotifications();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, loadNotifications]);

  const toggle = () => {
    setOpen((prev) => !prev);
  };

  const markAllRead = async () => {
    if (!hasToken()) {
      return;
    }
    try {
      const data = await apiFetch("/notifications/read-all", {
        method: "PATCH",
      });
      if (data && typeof data.unreadCount === "number") {
        setUnreadCount(data.unreadCount);
      }
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: n.readAt || new Date().toISOString() }))
      );
    } catch {
      // Best-effort; refresh on next poll/focus.
    }
  };

  const openNotification = async (notification) => {
    setOpen(false);
    if (notification && !notification.isRead) {
      apiFetch(`/notifications/${notification.id}/read`, {
        method: "PATCH",
      }).then(() => {
        if (hasToken()) {
          loadUnreadCount(true);
        }
      }).catch(() => {});
    }

    let route = null;
    if (notification && notification.documentId != null) {
      route = `/document-details/${notification.documentId}`;
    } else if (notification && notification.caseId != null) {
      route = `/case-details/${notification.caseId}`;
    }
    if (route) {
      navigate(route);
    }
  };

  const badgeCount = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="notification-bell" ref={rootRef}>
      <button
        className="icon-button"
        aria-label="Notifications"
        aria-expanded={open}
        onClick={toggle}
      >
        <span className={unreadCount > 0 ? "bell-icon has-unread" : "bell-icon"}>
          &#128276;
        </span>
        {unreadCount > 0 ? <span className="notif-badge">{badgeCount}</span> : null}
      </button>

      {open ? (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-header">
            <span className="notif-panel-title">Notifications</span>
            {unreadCount > 0 ? (
              <button
                className="notif-mark-all"
                type="button"
                onClick={markAllRead}
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="notif-panel-body">
            {loading && notifications.length === 0 ? (
              <div className="notif-empty">Loading notifications\u2026</div>
            ) : notifications.length === 0 ? (
              <div className="notif-empty">No notifications</div>
            ) : (
              <ul className="notif-list">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      className={
                        "notif-item" + (n.isRead ? "" : " unread")
                      }
                      onClick={() => openNotification(n)}
                    >
                      <span className="notif-item-icon">
                        {typeIcon(n.type)}
                      </span>
                      <span className="notif-item-content">
                        <span className="notif-item-title">{n.title}</span>
                        <span className="notif-item-message">{n.message}</span>
                        <span className="notif-item-time">
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                      {!n.isRead ? <span className="notif-unread-dot" /> : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!loading && total > notifications.length ? (
              <div className="notif-more">Showing latest {notifications.length} of {total}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NotificationBell;