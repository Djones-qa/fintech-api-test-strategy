/**
 * Publishes generated pact files to the Pact Broker.
 * Run after consumer tests: npm run test:contract:publish
 *
 * Requires PACT_BROKER_URL and optionally PACT_BROKER_TOKEN env vars.
 */
const { Publisher } = require('@pact-foundation/pact-node');
const path = require('path');

const opts = {
  pactFilesOrDirs: [path.resolve(__dirname, '../../pacts')],
  pactBroker: process.env.PACT_BROKER_URL ?? 'http://localhost:9292',
  pactBrokerToken: process.env.PACT_BROKER_TOKEN,
  consumerVersion: process.env.GIT_COMMIT ?? require('../../package.json').version,
  branch: process.env.GIT_BRANCH ?? 'main',
  tags: [process.env.GIT_BRANCH ?? 'main'],
};

new Publisher(opts)
  .publishPacts()
  .then(() => {
    console.log('✅ Pacts published successfully');
  })
  .catch((err) => {
    console.error('❌ Failed to publish pacts:', err.message);
    process.exit(1);
  });
