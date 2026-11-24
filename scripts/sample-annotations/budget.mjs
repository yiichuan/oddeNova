export function estimatedCost(ledger) {
  return (ledger.inputTokens * 0.8 + ledger.outputTokens * 2.7) / 1_000_000 + ledger.reserved;
}
export function reserveCharge(ledger, amount, ceiling) {
  if (![amount, ceiling].every(Number.isFinite) || amount < 0 || ceiling <= 0) throw Error('Invalid charge limit');
  if (estimatedCost(ledger) + amount > ceiling) return false;
  ledger.reserved += amount;
  ledger.attempts++;
  return true;
}
