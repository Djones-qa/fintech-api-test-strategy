/**
 * Pact Consumer test — Fintech API → Payment Processor
 *
 * Defines the contract from our side: what requests we send and what
 * responses we expect. The generated pact file is published to the broker
 * and verified against the real provider.
 *
 * Uses @pact-foundation/pact v16 PactV3 API.
 */
const path = require('path');
const http = require('http');
const { PactV3, MatchersV3 } = require('@pact-foundation/pact');
const { like, regex } = MatchersV3;

const provider = new PactV3({
  consumer: 'FintechAPI',
  provider: 'PaymentProcessor',
  dir: path.resolve(__dirname, '../../../pacts'),
  logLevel: 'warn',
});

/**
 * Minimal HTTP helper that works against the Pact mock server.
 * Avoids external dependencies — uses Node's built-in http module.
 */
function httpRequest(baseUrl, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, baseUrl);
    const payload = body ? JSON.stringify(body) : null;

    const options = {
      hostname: url.hostname,
      port: parseInt(url.port, 10),
      path: url.pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...headers,
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('PaymentProcessor — consumer contract', () => {
  describe('POST /v1/charges — create a charge', () => {
    test('successfully charges a tokenised card', async () => {
      await provider
        .given('a valid payment method token exists')
        .uponReceiving('a request to charge a tokenised card')
        .withRequest({
          method: 'POST',
          path: '/v1/charges',
          headers: {
            'Content-Type': 'application/json',
            Authorization: like('Bearer sk_test_abc123'),
          },
          body: {
            amount: like(50000),
            currency: regex('USD', /^[A-Z]{3}$/),
            payment_method: like('tok_test_abc123'),
            description: like('Loan disbursement - loan_id_123'),
          },
        })
        .willRespondWith({
          status: 201,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: like('ch_test_abc123'),
            status: like('succeeded'),
            amount: like(50000),
            currency: like('USD'),
            created: like(1700000000),
          },
        })
        .executeTest(async (mockServer) => {
          const result = await httpRequest(
            mockServer.url,
            'POST',
            '/v1/charges',
            {
              amount: 50000,
              currency: 'USD',
              payment_method: 'tok_test_abc123',
              description: 'Loan disbursement - loan_id_123',
            },
            { Authorization: 'Bearer sk_test_abc123' }
          );

          expect(result.status).toBe(201);
          expect(result.body.status).toBe('succeeded');
          expect(result.body.id).toBeDefined();
        });
    });

    test('handles declined card — 402 response', async () => {
      await provider
        .given('the payment method will be declined')
        .uponReceiving('a request to charge a declined card')
        .withRequest({
          method: 'POST',
          path: '/v1/charges',
          headers: {
            'Content-Type': 'application/json',
            Authorization: like('Bearer sk_test_abc123'),
          },
          body: {
            amount: like(50000),
            currency: like('USD'),
            payment_method: like('tok_declined'),
            description: like('Loan disbursement'),
          },
        })
        .willRespondWith({
          status: 402,
          headers: { 'Content-Type': 'application/json' },
          body: {
            error: {
              code: like('card_declined'),
              message: like('Your card was declined'),
              decline_code: like('insufficient_funds'),
            },
          },
        })
        .executeTest(async (mockServer) => {
          const result = await httpRequest(
            mockServer.url,
            'POST',
            '/v1/charges',
            {
              amount: 50000,
              currency: 'USD',
              payment_method: 'tok_declined',
              description: 'Loan disbursement',
            },
            { Authorization: 'Bearer sk_test_abc123' }
          );

          expect(result.status).toBe(402);
          expect(result.body.error.code).toBe('card_declined');
        });
    });
  });

  describe('GET /v1/charges/:id — retrieve a charge', () => {
    test('returns charge details', async () => {
      await provider
        .given('charge ch_test_abc123 exists')
        .uponReceiving('a request to retrieve a charge')
        .withRequest({
          method: 'GET',
          path: '/v1/charges/ch_test_abc123',
          headers: { Authorization: like('Bearer sk_test_abc123') },
        })
        .willRespondWith({
          status: 200,
          headers: { 'Content-Type': 'application/json' },
          body: {
            id: like('ch_test_abc123'),
            status: like('succeeded'),
            amount: like(50000),
            currency: like('USD'),
          },
        })
        .executeTest(async (mockServer) => {
          const result = await httpRequest(
            mockServer.url,
            'GET',
            '/v1/charges/ch_test_abc123',
            null,
            { Authorization: 'Bearer sk_test_abc123' }
          );

          expect(result.status).toBe(200);
          expect(result.body.id).toBeDefined();
          expect(result.body.amount).toBe(50000);
        });
    });
  });
});
