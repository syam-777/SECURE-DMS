const {
  getDashboardSummary,
  getRecentCases,
  getRecentActivity,
} = require("../models/dashboardModel");
const { safeAuditRecord } = require("./auditController");

const RECENT_CASES_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 10;

/**
 * Phase 10 dashboard. Aggregates card statistics, the most recently
 * updated cases, and the most recent sanitized audit activity in a
 * single read-only response.
 */
async function getDashboard(req, res, next) {
  try {
    const [summary, recentCases, activityRows] = await Promise.all([
      getDashboardSummary(),
      getRecentCases(RECENT_CASES_LIMIT),
      getRecentActivity(RECENT_ACTIVITY_LIMIT),
    ]);

    const recentActivity = activityRows.map((row) => {
      const safe = safeAuditRecord(row);
      return {
        id: safe.id,
        action: safe.action,
        resourceType: safe.resourceType,
        resourceId: safe.resourceId,
        details: safe.details,
        user:
          row.user_id != null
            ? {
                id: row.user_id,
                username: row.username,
                fullName: row.full_name,
              }
            : null,
        createdAt: safe.createdAt,
      };
    });

    summary.recentActivityCount = recentActivity.length;

    return res.json({
      success: true,
      data: {
        summary,
        recentCases,
        recentActivity,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getDashboard,
};