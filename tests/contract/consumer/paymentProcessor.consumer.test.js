/**
 * Pact Consumer test — Fintech API → Payment Processor
 *
 * Defines the contract from our side: what requests we send and what
 * responses we expect. The generated pact file is published to the broker
 * and verified against the real provider.
 *
 * This mirrors the EHR/lab-system pattern from the healthcare repo but in
 * the PCI-DSS domain: our API is the consumer, the payment processor is the provider.
 */
const path = require('path');
const { PactV3, MatchersV3 } = require('@pact-foundation/pact');
const { like, regex, integer, decimal } = MatchersV3;

// Simulated payment processor client (what our app would call)
const PaymentProcessorClient = require('./paymentProcessorClient');

const provider = new PactV3({
  consumer: 'FintechAPI',
  provider: 'PaymentProcessor',
  dir: path.resolve(__dirname, '../../../pacts'),
  logLevel: 'warn',
});

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
            amount: integer(50000),       // amount in cents
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
            amount: integer(50000),
            currency: like('USD'),
            created: integer(1700000000),
          },
        })
        .executeTest(async (mockServer) => {
          const client = new PaymentProcessorClient(mockServer.url, 'Bearer sk_test_abc123');
          const result = await client.createCharge({
            amount: 50000,
            currency: 'USD',
            payment_method: 'tok_test_abc123',
            description: 'Loan disbursement - loan_id_123',
          });

          expect(result.status).toBe('succeeded');
          expect(result.id).toBeDefined();
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
            amount: integer(50000),
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
          const client = new PaymentProcessorClient(mockServer.url, 'Bearer sk_test_abc123');

          await expect(
            client.createCharge({
              amount: 50000,
              currency: 'USD',
              payment_method: 'tok_declined',
              description: 'Loan disbursement',
            })
          ).rejects.toMatchObject({ code: 'card_declined' });
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
            amount: integer(50000),
            currency: like('USD'),
          },
        })
        .executeTest(async (mockServer) => {
          const client = new PaymentProcessorClient(mockServer.url, 'Bearer sk_test_abc123');
          const result = await client.getCharge('ch_test_abc123');

          expect(result.id).toBeDefined();
          expect(result.amount).toBe(50000);
        });
    });
  });
});
