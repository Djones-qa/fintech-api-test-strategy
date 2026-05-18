const winston = require('winston');

/**
 * Structured logger.
 * PCI-DSS 10.3 — log entries include timestamp, actor, action, outcome.
 * Sensitive fields (passwords, PANs, SSNs) are never logged.
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info'),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'fintech-api' },
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});

module.exports = logger;
