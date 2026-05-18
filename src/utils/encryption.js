const crypto = require('crypto');

/**
 * AES-256-GCM field-level encryption for PCI-DSS sensitive data (SSN, etc.).
 * PCI-DSS 3.4 — render stored data unreadable using strong cryptography.
 *
 * Key must be a 32-byte hex string (64 hex chars) from ENCRYPTION_KEY env var.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;

const getKey = () => {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
};

/**
 * Encrypt plaintext → base64-encoded ciphertext (iv:authTag:ciphertext).
 * @param {string} plaintext
 * @returns {string}
 */
const encrypt = (plaintext) => {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Store as colon-separated base64 segments
  return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
};

/**
 * Decrypt a value produced by `encrypt`.
 * @param {string} ciphertext
 * @returns {string}
 */
const decrypt = (ciphertext) => {
  const key = getKey();
  const [ivB64, authTagB64, dataB64] = ciphertext.split(':');

  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error('Invalid ciphertext format');
  }

  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
};

module.exports = { encrypt, decrypt };
