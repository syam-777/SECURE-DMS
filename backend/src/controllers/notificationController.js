const {
  findNotificationsForUser,
  countUnreadNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} = require("../models/notificationModel");

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.expose = true;
  return err;
}

// ─── GET /api/notifications ─────────────────────────────────
// Returns the authenticated user's own notifications, newest first.
// The user identity ALWAYS comes from req.user.id — never from the
// request body or query parameters.
async function listNotifications(req, res, next) {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const unreadOnly =
      req.query.unreadOnly === "true" || req.query.unreadOnly === "1";

    const data = await findNotificationsForUser(req.user.id, {
      page,
      limit,
      unreadOnly,
    });
    const unreadCount = await countUnreadNotifications(req.user.id);

    return res.json({
      success: true,
      notifications: data.notifications,
      total: data.total,
      page: data.page,
      limit: data.limit,
      totalPages: data.totalPages,
      unreadCount,
    });
  } catch (err) {
    return next(err);
  }
}

// ─── GET /api/notifications/unread-count ────────────────────
async function getUnreadCount(req, res, next) {
  try {
    const unreadCount = await countUnreadNotifications(req.user.id);
    return res.json({ success: true, unreadCount });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/notifications/:id/read ──────────────────────
// Marks ONE of the caller's own notifications as read. Ownership is
// enforced inside the model with `WHERE id = ? AND user_id = ?`, so a
// notification that is not the caller's behaves as "not found".
async function markRead(req, res, next) {
  try {
    const notification = await markNotificationRead(
      req.params.id,
      req.user.id
    );
    if (!notification) {
      throw httpError(404, "Notification not found");
    }

    return res.json({ success: true, notification });
  } catch (err) {
    return next(err);
  }
}

// ─── PATCH /api/notifications/read-all ──────────────────────
// Marks every one of the caller's unread notifications as read.
// Idempotent: repeated calls return unreadCount 0.
async function markAllRead(req, res, next) {
  try {
    const unreadCount = await markAllNotificationsRead(req.user.id);
    return res.json({ success: true, unreadCount });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
};