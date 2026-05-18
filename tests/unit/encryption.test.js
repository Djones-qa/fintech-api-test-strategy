/**
 * Unit tests for AES-256-GCM field-level encryption.
 * PCI-DSS 3.4 — verifies that sensitive data is correctly encrypted/decrypted
 * and that tampered ciphertext is rejected.
 */
const { encrypt, decrypt } = require('../../src/utils/encryption');

// Use a deterministic 32-byte test key
const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

describe('encrypt / decrypt', () => {
  test('round-trips plaintext correctly', () => {
    const plaintext = '123-45-6789';
    const ciphertext = encrypt(plaintext);
    expect(decrypt(ciphertext)).toBe(plaintext);
  });

  test('produces different ciphertext each call (random IV)', () => {
    const plaintext = '123-45-6789';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  test('ciphertext contains three colon-separated segments', () => {
    const ciphertext = encrypt('test');
    const parts = ciphertext.split(':');
    expect(parts).toHaveLength(3);
  });

  test('throws on tampered ciphertext (auth tag mismatch)', () => {
    const ciphertext = encrypt('sensitive');
    const parts = ciphertext.split(':');
    // Corrupt the data segment
    parts[2] = Buffer.from('corrupted').toString('base64');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  test('throws on malformed ciphertext (missing segments)', () => {
    expect(() => decrypt('notvalidbase64')).toThrow('Invalid ciphertext format');
  });

  test('throws when ENCRYPTION_KEY is missing', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
  });

  test('throws when ENCRYPTION_KEY is wrong length', () => {
    process.env.ENCRYPTION_KEY = 'tooshort';
    expect(() => encrypt('test')).toThrow('ENCRYPTION_KEY');
  });

  test('handles unicode plaintext', () => {
    const plaintext = 'Ünïcödé-tëst-123';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });
});
