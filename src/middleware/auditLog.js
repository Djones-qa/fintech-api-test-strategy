const { query } = require('../config/database');
const logger = require('../config/logger');

/**
 * Writes an immutable audit record.
 * PCI-DSS 10.2 — log all access to cardholder data and authentication events.
 *
 * @param {object} opts
 * @param {string|null} opts.actorId       UUID of the acting user (null = system)
 * @param {string|null} opts.actorRole     Role of the acting user
 * @param {string}      opts.action        e.g. 'loan.submit', 'payment.create', 'auth.login'
 * @param {string}      opts.resourceType  e.g. 'loan_application', 'payment', 'user'
 * @param {string|null} opts.resourceId    UUID of the affected resource
 * @param {object|null} opts.changes       Sanitised diff (no raw PAN/SSN/passwords)
 * @param {string|null} opts.ipAddress     Client IP
 * @param {string|null} opts.userAgent     Client user-agent
 * @param {boolean}     opts.success       Whether the operation succeeded
 * @param {string|null} opts.errorMessage  Error detail on failure
 */
const writeAuditLog = async (opts) => {
  const {
    actorId = null,
    actorRole = null,
    action,
    resourceType,
    resourceId = null,
    changes = null,
    ipAddress = null,
    userAgent = null,
    success = true,
    errorMessage = null,
  } = opts;

  try {
    await query(
      `INSERT INTO audit_log
         (actor_id, actor_role, action, resource_type, resource_id,
          changes, ip_address, user_agent, success, error_message)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        actorId,
        actorRole,
        action,
        resourceType,
        resourceId,
        changes ? JSON.stringify(changes) : null,
        ipAddress,
        userAgent,
        success,
        errorMessage,
      ]
    );
  } catch (err) {
    // Audit failures must not break the main request — log and continue
    logger.error('Failed to write audit log', { err: err.message, action, resourceType });
  }
};

/**
 * Express middleware that attaches a convenience helper to `res.locals`.
 * Handlers call: await res.locals.audit({ action, resourceType, ... })
 */
const auditMiddleware = (req, res, next) => {
  res.locals.audit = (opts) =>
    writeAuditLog({
      actorId: req.user?.id ?? null,
      actorRole: req.user?.role ?? null,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
      ...opts,
    });
  next();
};

module.exports = { writeAuditLog, auditMiddleware };
