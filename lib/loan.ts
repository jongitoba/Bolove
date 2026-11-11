const nok = new Intl.NumberFormat("nb-NO", {
  maximumFractionDigits: 0,
});

export function formatKr(value: number) {
  if (!Number.isFinite(value)) return "-";
  return `${nok.format(Math.round(value))} kr`;
}

// Standard annuitetslån: equal monthly payments for the whole term, with the
// interest/principal split shifting over time. This is the default repayment
// structure for Norwegian boliglån, so it's what "monthly cost" means here.
export function calculateAnnuityLoan(
  loanAmount: number,
  annualRatePercent: number,
  termYears: number,
) {
  const monthlyRate = annualRatePercent / 100 / 12;
  const numPayments = termYears * 12;

  if (numPayments <= 0) {
    return { monthlyPayment: 0, totalRepayment: 0, totalInterest: 0 };
  }

  const monthlyPayment =
    monthlyRate === 0
      ? loanAmount / numPayments
      : (loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -numPayments));

  const totalRepayment = monthlyPayment * numPayments;
  const totalInterest = totalRepayment - loanAmount;

  return { monthlyPayment, totalRepayment, totalInterest };
}
