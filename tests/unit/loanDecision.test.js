/**
 * Unit tests for the loan decision engine.
 *
 * These are the primary target for Stryker mutation testing — pure logic,
 * no I/O, every branch must be exercised to kill mutants.
 */
const {
  decideLoan,
  CREDIT_SCORE_MINIMUM,
  MAX_DTI,
  MAX_INCOME_MULTIPLE,
} = require('../../src/utils/loanDecision');

describe('decideLoan — rejection paths', () => {
  test('rejects when credit score is below minimum', () => {
    const result = decideLoan({
      creditScore: CREDIT_SCORE_MINIMUM - 1,
      annualIncome: 80000,
      amountRequested: 20000,
      termMonths: 60,
    });

    expect(result.approved).toBe(false);
    expect(result.rate).toBeNull();
    expect(result.reason).toMatch(/credit score/i);
  });

  test('rejects exactly at the boundary (score = minimum - 1)', () => {
    const result = decideLoan({
      creditScore: 579,
      annualIncome: 80000,
      amountRequested: 20000,
      termMonths: 60,
    });
    expect(result.approved).toBe(false);
  });

  test('rejects when DTI exceeds maximum', () => {
    // High existing debt pushes DTI over 43%
    const result = decideLoan({
      creditScore: 720,
      annualIncome: 36000,   // $3,000/month
      amountRequested: 25000,
      termMonths: 60,
      existingDebt: 1500,    // already 50% DTI before new payment
    });

    expect(result.approved).toBe(false);
    expect(result.reason).toMatch(/debt-to-income/i);
  });

  test('rejects when requested amount exceeds income multiple cap', () => {
    const result = decideLoan({
      creditScore: 800,
      annualIncome: 50000,
      amountRequested: 300000, // 6× income — over the 5× cap
      termMonths: 360,
    });

    expect(result.approved).toBe(false);
    expect(result.reason).toMatch(/annual income/i);
  });
});

describe('decideLoan — approval paths', () => {
  test('approves a clean application and returns an interest rate', () => {
    const result = decideLoan({
      creditScore: 750,
      annualIncome: 100000,
      amountRequested: 30000,
      termMonths: 60,
    });

    expect(result.approved).toBe(true);
    expect(result.rate).toBeGreaterThan(0);
    expect(result.reason).toBeNull();
  });

  test('approves at minimum passing credit score (580)', () => {
    const result = decideLoan({
      creditScore: 580,
      annualIncome: 60000,
      amountRequested: 10000,
      termMonths: 36,
    });

    expect(result.approved).toBe(true);
  });

  test('assigns highest rate tier for score 580–619', () => {
    const result = decideLoan({
      creditScore: 600,
      annualIncome: 60000,
      amountRequested: 10000,
      termMonths: 36,
    });

    expect(result.approved).toBe(true);
    expect(result.rate).toBe(0.1599);
  });

  test('assigns lowest rate tier for score ≥ 750', () => {
    const result = decideLoan({
      creditScore: 800,
      annualIncome: 100000,
      amountRequested: 20000,
      termMonths: 60,
    });

    expect(result.approved).toBe(true);
    expect(result.rate).toBe(0.0499);
  });

  test('defaults existingDebt to 0 when not provided', () => {
    const withDebt = decideLoan({
      creditScore: 720,
      annualIncome: 80000,
      amountRequested: 20000,
      termMonths: 60,
      existingDebt: 0,
    });

    const withoutDebt = decideLoan({
      creditScore: 720,
      annualIncome: 80000,
      amountRequested: 20000,
      termMonths: 60,
    });

    expect(withDebt).toEqual(withoutDebt);
  });
});

describe('decideLoan — boundary conditions', () => {
  test('approves exactly at credit score minimum (580)', () => {
    const result = decideLoan({
      creditScore: 580,
      annualIncome: 80000,
      amountRequested: 15000,
      termMonths: 48,
    });
    expect(result.approved).toBe(true);
  });

  test('rejects when amount is exactly at income multiple cap + 1', () => {
    const annualIncome = 50000;
    const result = decideLoan({
      creditScore: 800,
      annualIncome,
      amountRequested: annualIncome * MAX_INCOME_MULTIPLE + 1,
      termMonths: 360,
    });
    expect(result.approved).toBe(false);
  });

  test('approves when amount is exactly at income multiple cap', () => {
    const annualIncome = 50000;
    const result = decideLoan({
      creditScore: 800,
      annualIncome,
      amountRequested: annualIncome * MAX_INCOME_MULTIPLE,
      termMonths: 360,
    });
    expect(result.approved).toBe(true);
  });
});
