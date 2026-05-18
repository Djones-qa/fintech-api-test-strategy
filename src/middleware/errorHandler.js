const logger = require('../config/logger');

/**
 * Centralised error handler.
 * Never leaks stack traces or internal details to the client in production.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;

  logger.error('Unhandled error', {
    status,
    message: err.message,
    path: req.path,
    method: req.method,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
  });

  // Postgres unique-violation → 409
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'A record with that value already exists',
    });
  }

  // Postgres foreign-key violation → 422
  if (err.code === '23503') {
    return res.status(422).json({
      error: 'Unprocessable Entity',
      message: 'Referenced resource does not exist',
    });
  }

  const body = {
    error: status >= 500 ? 'Internal Server Error' : err.name || 'Error',
    message:
      status >= 500 && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred'
        : err.message,
    ...(process.env.NODE_ENV === 'test' && err.code ? { pg_code: err.code, pg_detail: err.detail } : {}),
  };

  res.status(status).json(body);
};

module.exports = errorHandler;
