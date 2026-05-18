/**
 * Automated loan decision engine.
 * Pure function — no I/O, easy to unit-test and mutation-test.
 *
 * Decision criteria (simplified for demo; real underwriting is more complex):
 *  - Credit score < 580  → reject
 *  - DTI > 0.43          → reject  (Qualified Mortgage rule)
 *  - Amount > income * 5 → reject  (income multiple cap)
 *  - Otherwise           → approve with risk-tiered interest rate
 */

const CREDIT_SCORE_MINIMUM = 580;
const MAX_DTI = 0.43;
const MAX_INCOME_MULTIPLE = 5;

// Risk tiers → annual interest rate
const RATE_TIERS = [
  { minScore: 750, rate: 0.0499 },
  { minScore: 700, rate: 0.0699 },
  { minScore: 650, rate: 0.0999 },
  { minScore: 620, rate: 0.1299 },
  { minScore: 580, rate: 0.1599 },
];

/**
 * @param {object} params
 * @param {number} params.creditScore      300–850
 * @param {number} params.annualIncome     USD
 * @param {number} params.amountRequested  USD
 * @param {number} params.termMonths       Loan term
 * @param {number} params.existingDebt     Monthly existing debt payments (USD)
 * @returns {{ approved: boolean, rate: number|null, reason: string|null }}
 */
const decideLoan = ({ creditScore, annualIncome, amountRequested, termMonths, existingDebt = 0 }) => {
  if (creditScore < CREDIT_SCORE_MINIMUM) {
    return {
      approved: false,
      rate: null,
      reason: `Credit score ${creditScore} is below minimum ${CREDIT_SCORE_MINIMUM}`,
    };
  }

  const monthlyIncome = annualIncome / 12;
  // Estimated monthly payment using simple amortisation
  const monthlyRate = RATE_TIERS.find((t) => creditScore >= t.minScore)?.rate / 12 ?? 0.02;
  const estimatedPayment =
    (amountRequested * monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
    (Math.pow(1 + monthlyRate, termMonths) - 1);

  const dti = (existingDebt + estimatedPayment) / monthlyIncome;

  if (dti > MAX_DTI) {
    return {
      approved: false,
      rate: null,
      reason: `Debt-to-income ratio ${(dti * 100).toFixed(1)}% exceeds maximum ${MAX_DTI * 100}%`,
    };
  }

  if (amountRequested > annualIncome * MAX_INCOME_MULTIPLE) {
    return {
      approved: false,
      rate: null,
      reason: `Requested amount exceeds ${MAX_INCOME_MULTIPLE}× annual income`,
    };
  }

  const tier = RATE_TIERS.find((t) => creditScore >= t.minScore);
  return {
    approved: true,
    rate: tier.rate,
    reason: null,
  };
};

module.exports = { decideLoan, CREDIT_SCORE_MINIMUM, MAX_DTI, MAX_INCOME_MULTIPLE, RATE_TIERS };
