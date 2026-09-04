const { pool } = require("../config/database");

/**
 * All canonical case statuses.
 */
const CASE_STATUSES = [
  "open",
  "in_progress",
  "under_review",
  "closed",
  "archived",
];

/**
 * All canonical case priorities.
 */
const CASE_PRIORITIES = ["low", "medium", "high", "critical"];

/**
 * Safe sort columns exposed to the client. Anything not on this list is
 * rejected so no arbitrary (or unsafe) SQL column can be injected.
 */
const SORTABLE_COLUMNS = [
  "id",
  "case_number",
  "title",
  "status",
  "priority",
  "created_at",
  "updated_at",
];

/**
 * Validate that `status` is a known canonical status.
 * @param {string} status
 * @returns {boolean}
 */
function isValidStatus(status) {
  return CASE_STATUSES.includes(status);
}

/**
 * Validate that `priority` is a known canonical priority.
 * @param {string} priority
 * @returns {boolean}
 */
function isValidPriority(priority) {
  return CASE_PRIORITIES.includes(priority);
}

/**
 * Find a single case by its primary key, joined with the creator and the
 * primary assigned user. Never returns password_hash. Assignment details
 * can be fetched separately via findAssignmentsByCase.
 * @param {number|string} id
 * @returns {Promise<object|null>}
 */
async function findCaseById(id) {
  const [rows] = await pool.query(
    "SELECT c.id, c.case_number, c.title, c.case_type, c.description, " +
      "c.status, c.priority, c.created_by, c.assigned_to, " +
      "c.created_at, c.updated_at, " +
      "creator.id AS creator_id, creator.username AS creator_username, " +
      "creator.full_name AS creator_name, " +
      "assignee.id AS assignee_id, assignee.username AS assignee_username, " +
      "assignee.full_name AS assignee_name " +
      "FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      "WHERE c.id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

/**
 * Find a case's case_number by its id (used to confirm existence and to
 * resolve a friendly reference).
 * @param {number|string} id
 * @returns {Promise<object|null>} row with { id, case_number } or null
 */
async function findCaseNumberById(id) {
  const [rows] = await pool.query(
    "SELECT id, case_number FROM cases WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

/**
 * Find a case by its unique case_number.
 * @param {string} caseNumber
 * @returns {Promise<object|null>}
 */
async function findCaseByNumber(caseNumber) {
  const [rows] = await pool.query(
    "SELECT id, case_number FROM cases WHERE case_number = ? LIMIT 1",
    [caseNumber]
  );
  return rows[0] || null;
}

/**
 * Generate the next unique case number in the format CASE-YYYY-NNN, where
 * NNN is the next sequential number for the current year. Because of the
 * UNIQUE constraint on case_number, the caller should retry on a
 * duplicate-key error (see the controller) to make collisions harmless.
 * @returns {Promise<string>} e.g. CASE-2026-001
 */
async function generateCaseNumber() {
  const year = new Date().getFullYear();
  const [rows] = await pool.query(
    "SELECT case_number FROM cases WHERE case_number LIKE ? " +
      "ORDER BY case_number DESC LIMIT 1",
    [`CASE-${year}-%`]
  );

  let nextSeq = 1;
  if (rows[0]) {
    const match = rows[0].case_number.match(/^CASE-\d{4}-(\d+)$/);
    if (match) {
      nextSeq = parseInt(match[1], 10) + 1;
    }
  }

  return `CASE-${year}-${String(nextSeq).padStart(3, "0")}`;
}

/**
 * Insert a new case.
 * @param {{
 *   caseNumber: string,
 *   title: string,
 *   caseType?: string|null,
 *   description?: string|null,
 *   status?: string,
 *   priority?: string,
 *   createdBy: number
 * }} data
 * @returns {Promise<number>} the new case id
 */
async function createCase(data) {
  const [result] = await pool.query(
    "INSERT INTO cases " +
      "(case_number, title, case_type, description, status, priority, created_by) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)",
    [
      data.caseNumber,
      data.title,
      data.caseType != null ? data.caseType : null,
      data.description != null ? data.description : null,
      data.status || "open",
      data.priority || "medium",
      data.createdBy,
    ]
  );
  return result.insertId;
}

/**
 * Return a paginated, filtered, searchable, safely-sorted list of cases.
 * Each row includes creator and primary-assignee display info. Never
 * returns password_hash.
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   search?: string,
 *   status?: string,
 *   priority?: string,
 *   sort?: string,
 *   order?: string
 * }} opts
 * @returns {Promise<{ cases: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function findAllCases({
  page = 1,
  limit = 20,
  search = "",
  status = "",
  priority = "",
  sort = "id",
  order = "asc",
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];

  if (search && String(search).trim()) {
    where.push(
      "(c.case_number LIKE ? OR c.title LIKE ? OR creator.full_name LIKE ? " +
        "OR assignee.full_name LIKE ?)"
    );
    const like = `%${String(search).trim()}%`;
    params.push(like, like, like, like);
  }
  if (status && isValidStatus(status)) {
    where.push("c.status = ?");
    params.push(status);
  }
  if (priority && isValidPriority(priority)) {
    where.push("c.priority = ?");
    params.push(priority);
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  // Determine the ordering column; fall back to a safe default.
  const sortCol = SORTABLE_COLUMNS.includes(sort) ? sort : "id";
  const orderDir = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";

  const [countResult] = await pool.query(
    "SELECT COUNT(*) AS total FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      whereSql,
    params
  );
  const total = countResult[0].total;

  const [rows] = await pool.query(
    "SELECT c.id, c.case_number, c.title, c.case_type, c.description, " +
      "c.status, c.priority, c.created_by, c.assigned_to, " +
      "c.created_at, c.updated_at, " +
      "creator.full_name AS creator_name, " +
      "creator.username AS creator_username, " +
      "assignee.full_name AS assignee_name, " +
      "assignee.username AS assignee_username, " +
      "(SELECT COUNT(*) FROM case_assignments ca WHERE ca.case_id = c.id) AS assignments_count " +
      "FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      whereSql +
      ` ORDER BY c.${sortCol} ${orderDir}, c.id ASC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    cases: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

/**
 * Safe sort columns for the Phase 8 search API. Anything not on this
 * list is rejected so no arbitrary (or unsafe) SQL column can be
 * injected.
 */
const SEARCH_SORTABLE_COLUMNS = [
  "id",
  "case_number",
  "title",
  "case_type",
  "status",
  "priority",
  "created_at",
  "updated_at",
];

/**
 * Phase 8 search API. Same safe pattern as findAllCases but searches
 * across case_number, title, description and case_type with optional
 * status/priority/caseType filters. Fully parameterized; never returns
 * password_hash.
 * @param {{
 *   page?: number,
 *   limit?: number,
 *   q?: string,
 *   status?: string,
 *   priority?: string,
 *   caseType?: string,
 *   sort?: string,
 *   order?: string
 * }} opts
 * @returns {Promise<{ cases: object[], total: number, page: number, limit: number, totalPages: number }>}
 */
async function searchCases({
  page = 1,
  limit = 20,
  q = "",
  status = "",
  priority = "",
  caseType = "",
  sort = "id",
  order = "asc",
} = {}) {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  const where = [];
  const params = [];

  if (q && String(q).trim()) {
    where.push(
      "(c.case_number LIKE ? OR c.title LIKE ? OR c.description LIKE ? " +
        "OR c.case_type LIKE ?)"
    );
    const like = `%${String(q).trim()}%`;
    params.push(like, like, like, like);
  }
  if (status && isValidStatus(status)) {
    where.push("c.status = ?");
    params.push(status);
  }
  if (priority && isValidPriority(priority)) {
    where.push("c.priority = ?");
    params.push(priority);
  }
  if (caseType && String(caseType).trim()) {
    where.push("c.case_type = ?");
    params.push(String(caseType).trim());
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  const sortCol = SEARCH_SORTABLE_COLUMNS.includes(sort) ? sort : "id";
  const orderDir = String(order).toLowerCase() === "desc" ? "DESC" : "ASC";

  const [countResult] = await pool.query(
    "SELECT COUNT(*) AS total FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      whereSql,
    params
  );
  const total = countResult[0].total;

  const [rows] = await pool.query(
    "SELECT c.id, c.case_number, c.title, c.case_type, c.description, " +
      "c.status, c.priority, c.created_by, c.assigned_to, " +
      "c.created_at, c.updated_at, " +
      "creator.full_name AS creator_name, " +
      "creator.username AS creator_username, " +
      "assignee.full_name AS assignee_name, " +
      "assignee.username AS assignee_username, " +
      "(SELECT COUNT(*) FROM case_assignments ca WHERE ca.case_id = c.id) AS assignments_count " +
      "FROM cases c " +
      "LEFT JOIN users creator ON creator.id = c.created_by " +
      "LEFT JOIN users assignee ON assignee.id = c.assigned_to " +
      whereSql +
      ` ORDER BY c.${sortCol} ${orderDir}, c.id ASC LIMIT ? OFFSET ?`,
    [...params, safeLimit, offset]
  );

  return {
    cases: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

/**
 * Update editable case fields. `id`, `case_number`, `created_by`, and
 * `created_at` are intentionally never modified here.
 * @param {number|string} id
 * @param {{
 *   title?: string,
 *   caseType?: string|null,
 *   description?: string|null,
 *   priority?: string
 * }} fields
 * @returns {Promise<boolean>} true if a row was updated
 */
async function updateCase(id, fields) {
  const sets = [];
  const vals = [];

  if (fields.title !== undefined) {
    sets.push("title = ?");
    vals.push(fields.title);
  }
  if (fields.caseType !== undefined) {
    sets.push("case_type = ?");
    vals.push(fields.caseType);
  }
  if (fields.description !== undefined) {
    sets.push("description = ?");
    vals.push(fields.description);
  }
  if (fields.priority !== undefined) {
    sets.push("priority = ?");
    vals.push(fields.priority);
  }

  if (sets.length === 0) {
    return false;
  }

  vals.push(id);
  const [result] = await pool.query(
    "UPDATE cases SET " + sets.join(", ") + " WHERE id = ?",
    vals
  );
  return result.affectedRows > 0;
}

/**
 * Update only the status of a case.
 * @param {number|string} id
 * @param {string} status one of the canonical statuses
 * @returns {Promise<boolean>} true if a row was updated
 */
async function updateCaseStatus(id, status) {
  const [result] = await pool.query(
    "UPDATE cases SET status = ? WHERE id = ?",
    [status, id]
  );
  return result.affectedRows > 0;
}

/**
 * Delete a case permanently (cascades to case_assignments and sets any
 * related documents' case_id to NULL).
 * @param {number|string} id
 * @returns {Promise<boolean>} true if a row was deleted
 */
async function deleteCase(id) {
  const [result] = await pool.query("DELETE FROM cases WHERE id = ?", [id]);
  return result.affectedRows > 0;
}

/**
 * Return all assignments for a case, joined with user display info.
 * Never returns password_hash.
 * @param {number|string} caseId
 * @returns {Promise<object[]>}
 */
async function findAssignmentsByCase(caseId) {
  const [rows] = await pool.query(
    "SELECT ca.id AS assignment_id, ca.case_id, ca.user_id, " +
      "ca.assignment_role, ca.assigned_by, ca.created_at, " +
      "u.username, u.full_name, u.email, u.is_active " +
      "FROM case_assignments ca " +
      "JOIN users u ON u.id = ca.user_id " +
      "WHERE ca.case_id = ? " +
      "ORDER BY ca.id ASC",
    [caseId]
  );
  return rows;
}

/**
 * Check whether a specific assignment already exists for a case+user+role.
 * @param {number|string} caseId
 * @param {number|string} userId
 * @param {string} assignmentRole
 * @returns {Promise<boolean>}
 */
async function assignmentExists(caseId, userId, assignmentRole) {
  const [rows] = await pool.query(
    "SELECT id FROM case_assignments " +
      "WHERE case_id = ? AND user_id = ? AND assignment_role = ? LIMIT 1",
    [caseId, userId, assignmentRole]
  );
  return rows.length > 0;
}

/**
 * Create a new assignment of a user to a case with a role label.
 * @param {{
 *   caseId: number,
 *   userId: number,
 *   assignmentRole: string,
 *   assignedBy: number
 * }} data
 * @returns {Promise<number>} the new assignment id
 */
async function createAssignment(data) {
  const [result] = await pool.query(
    "INSERT INTO case_assignments (case_id, user_id, assignment_role, assigned_by) " +
      "VALUES (?, ?, ?, ?)",
    [data.caseId, data.userId, data.assignmentRole, data.assignedBy]
  );
  return result.insertId;
}

/**
 * Remove a specific assignment (case + user, optionally filtered by role).
 * @param {number|string} caseId
 * @param {number|string} userId
 * @param {string} [assignmentRole]
 * @returns {Promise<boolean>} true if a row was deleted
 */
async function deleteAssignment(caseId, userId, assignmentRole) {
  if (assignmentRole != null && String(assignmentRole).trim()) {
    const [result] = await pool.query(
      "DELETE FROM case_assignments WHERE case_id = ? AND user_id = ? AND assignment_role = ?",
      [caseId, userId, assignmentRole]
    );
    return result.affectedRows > 0;
  }
  const [result] = await pool.query(
    "DELETE FROM case_assignments WHERE case_id = ? AND user_id = ?",
    [caseId, userId]
  );
  return result.affectedRows > 0;
}

module.exports = {
  CASE_STATUSES,
  CASE_PRIORITIES,
  isValidStatus,
  isValidPriority,
  findCaseById,
  findCaseByNumber,
  findCaseNumberById,
  generateCaseNumber,
  createCase,
  findAllCases,
  searchCases,
  updateCase,
  updateCaseStatus,
  deleteCase,
  findAssignmentsByCase,
  assignmentExists,
  createAssignment,
  deleteAssignment,
};
