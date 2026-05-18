/**
 * Thin HTTP client for the external Payment Processor API.
 * This is the code under test in the consumer contract — it's what our
 * application actually calls when processing payments.
 *
 * In production, baseUrl comes from an env var pointing at the real processor.
 * In contract tests, it points at the Pact mock server.
 */
const https = require('https');
const http = require('http');

class PaymentProcessorClient {
  /**
   * @param {string} baseUrl    e.g. 'https://api.paymentprocessor.com'
   * @param {string} authToken  Bearer token
   */
  constructor(baseUrl, authToken) {
    this.baseUrl = baseUrl;
    this.authToken = authToken;
  }

  /**
   * @private
   */
  _request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const payload = body ? JSON.stringify(body) : null;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method,
        headers: {
          Authorization: this.authToken,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const err = new Error(parsed.error?.message ?? 'Payment processor error');
            err.statusCode = res.statusCode;
            err.code = parsed.error?.code;
            err.decline_code = parsed.error?.decline_code;
            return reject(err);
          }
          resolve(parsed);
        });
      });

      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  /**
   * Create a charge.
   * @param {{ amount: number, currency: string, payment_method: string, description: string }} params
   */
  createCharge(params) {
    return this._request('POST', '/v1/charges', params);
  }

  /**
   * Retrieve a charge by ID.
   * @param {string} chargeId
   */
  getCharge(chargeId) {
    return this._request('GET', `/v1/charges/${chargeId}`);
  }

  /**
   * Refund a charge.
   * @param {string} chargeId
   * @param {number} amount   Amount in cents (partial refund if less than original)
   */
  refundCharge(chargeId, amount) {
    return this._request('POST', `/v1/charges/${chargeId}/refunds`, { amount });
  }
}

module.exports = PaymentProcessorClient;
