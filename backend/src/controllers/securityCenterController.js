const { getSecurityOverview } = require("../models/securityCenterModel");

/**
 * Security Center controller — Admin Security Center overview endpoint.
 * Read-only aggregations only; errors are forwarded to the central
 * error handler like every other controller.
 */

async function getOverview(req, res, next) {
  try {
    const overview = await getSecurityOverview();
    res.json({ success: true, ...overview });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
};