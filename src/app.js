const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const loanRoutes = require('./routes/loans');
const paymentRoutes = require('./routes/payments');
const errorHandler = require('./middleware/errorHandler');
const logger = require('./config/logger');

const app = express();

// ─── Security headers (PCI-DSS 6.6) ──────────────────────────────────────────
app.use(helmet());

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') ?? '*' }));

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' })); // Limit body size (PCI-DSS 6.5)

// ─── Rate limiting (PCI-DSS 6.5.4) ───────────────────────────────────────────
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10),
  max: parseInt(process.env.RATE_LIMIT_MAX ?? '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too Many Requests', message: 'Rate limit exceeded, try again later' },
});
app.use(limiter);

// ─── Request logging ──────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  logger.info('Incoming request', { method: req.method, path: req.path, ip: req.ip });
  next();
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth', authRoutes);
app.use('/loans', loanRoutes);
app.use('/payments', paymentRoutes);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not Found', message: 'Route not found' }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
