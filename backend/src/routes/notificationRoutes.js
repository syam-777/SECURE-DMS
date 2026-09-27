const express = require("express");
const router = express.Router();

const {
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
} = require("../controllers/notificationController");
const {
  authenticate,
  authorize,
} = require("../middleware/authMiddleware");
const {
  notificationListValidators,
  notificationIdParamValidator,
  validateRequest,
} = require("../middleware/validate");

router.use(authenticate);
router.use(authorize("notifications:read"));

// NOTE: /read-all and /unread-count are registered BEFORE /:id/read
// so they are never swallowed by the parameterized route.

router.get(
  "/",
  notificationListValidators,
  validateRequest,
  listNotifications
);

router.get("/unread-count", getUnreadCount);

router.patch("/read-all", markAllRead);

router.patch(
  "/:id/read",
  notificationIdParamValidator,
  validateRequest,
  markRead
);

module.exports = router;