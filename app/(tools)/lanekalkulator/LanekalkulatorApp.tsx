"use client";

import { useId, useMemo, useState } from "react";
import { calculateAnnuityLoan, formatKr } from "@/lib/loan";
import styles from "./lanekalkulator.module.css";

export default function LanekalkulatorApp() {
  const [totalCost, setTotalCost] = useState(5_000_000);
  const [loanPercentage, setLoanPercentage] = useState(60);
  const [termYears, setTermYears] = useState(30);
  const [interestRate, setInterestRate] = useState(5.19);
  const [terminFee, setTerminFee] = useState(49);

  const totalCostId = useId();
  const loanPercentageId = useId();
  const termYearsId = useId();
  const interestRateId = useId();
  const terminFeeId = useId();

  const {
    loanAmount,
    equity,
    totalMonthlyPayment,
    totalRepayment,
    totalInterest,
    totalTerminFees,
  } = useMemo(() => {
    const loanAmount = (totalCost * loanPercentage) / 100;
    const equity = totalCost - loanAmount;
    const { monthlyPayment, totalInterest } = calculateAnnuityLoan(
      loanAmount,
      interestRate,
      termYears,
    );
    const numPayments = termYears * 12;
    const totalTerminFees = terminFee * numPayments;
    const totalMonthlyPayment = monthlyPayment + terminFee;
    const totalRepayment = loanAmount + totalInterest + totalTerminFees;
    return {
      loanAmount,
      equity,
      monthlyPayment,
      totalMonthlyPayment,
      totalRepayment,
      totalInterest,
      totalTerminFees,
    };
  }, [totalCost, loanPercentage, termYears, interestRate, terminFee]);

  return (
    <div className={styles.wrap}>
      <h1>Lånekalkulator</h1>
      <p className={styles.intro}>
        Se hva boliglånet ditt vil koste per måned, og totalt over hele
        nedbetalingstiden.
      </p>

      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label htmlFor={totalCostId}>Boligens totalpris</label>
              <span className={styles.value}>{formatKr(totalCost)}</span>
            </div>
            <input
              id={totalCostId}
              type="range"
              min={500_000}
              max={20_000_000}
              step={50_000}
              value={totalCost}
              onChange={(e) => setTotalCost(Number(e.target.value))}
            />
            <input
              type="number"
              className={styles.numberInput}
              min={0}
              step={10_000}
              value={totalCost}
              onChange={(e) => setTotalCost(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label htmlFor={loanPercentageId}>Ønsket belåningsgrad</label>
              <span className={styles.value}>{loanPercentage} %</span>
            </div>
            <input
              id={loanPercentageId}
              type="range"
              min={0}
              max={100}
              step={1}
              value={loanPercentage}
              onChange={(e) => setLoanPercentage(Number(e.target.value))}
            />
            <input
              type="number"
              className={styles.numberInput}
              min={0}
              max={100}
              step={1}
              value={loanPercentage}
              onChange={(e) =>
                setLoanPercentage(Math.min(100, Math.max(0, Number(e.target.value) || 0)))
              }
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label htmlFor={termYearsId}>Nedbetalingstid</label>
              <span className={styles.value}>{termYears} år</span>
            </div>
            <input
              id={termYearsId}
              type="range"
              min={1}
              max={30}
              step={1}
              value={termYears}
              onChange={(e) => setTermYears(Number(e.target.value))}
            />
            <input
              type="number"
              className={styles.numberInput}
              min={1}
              max={50}
              step={1}
              value={termYears}
              onChange={(e) => setTermYears(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label htmlFor={interestRateId}>Lånerente</label>
              <span className={styles.value}>{interestRate.toFixed(2)} %</span>
            </div>
            <input
              id={interestRateId}
              type="range"
              min={0}
              max={10}
              step={0.01}
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
            />
            <input
              type="number"
              className={styles.numberInput}
              min={0}
              max={20}
              step={0.01}
              value={interestRate}
              onChange={(e) => setInterestRate(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>

          <div className={styles.field}>
            <div className={styles.fieldHeader}>
              <label htmlFor={terminFeeId}>Terminavgift</label>
              <span className={styles.value}>{formatKr(terminFee)}</span>
            </div>
            <input
              id={terminFeeId}
              type="range"
              min={0}
              max={200}
              step={1}
              value={terminFee}
              onChange={(e) => setTerminFee(Number(e.target.value))}
            />
            <input
              type="number"
              className={styles.numberInput}
              min={0}
              step={1}
              value={terminFee}
              onChange={(e) => setTerminFee(Math.max(0, Number(e.target.value) || 0))}
            />
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.resultHighlight}>
            <span className={styles.resultLabel}>Du må betale banken per måned</span>
            <span className={styles.resultValue}>{formatKr(totalMonthlyPayment)}</span>
          </div>

          <dl className={styles.resultList}>
            <div className={styles.resultRow}>
              <dt>Egenkapital</dt>
              <dd>{formatKr(equity)}</dd>
            </div>
            <div className={styles.resultDivider} />
            <div className={styles.resultRow}>
              <dt>Lånebeløp</dt>
              <dd>{formatKr(loanAmount)}</dd>
            </div>
            <div className={styles.resultRow}>
              <dt>Rentekostnader</dt>
              <dd>{formatKr(totalInterest)}</dd>
            </div>
            <div className={styles.resultRow}>
              <dt>Terminavgifter</dt>
              <dd>{formatKr(totalTerminFees)}</dd>
            </div>
            <div className={`${styles.resultRow} ${styles.resultRowTotal}`}>
              <dt>Lånet vil totalt koste</dt>
              <dd>{formatKr(totalRepayment)}</dd>
            </div>
          </dl>

          <p className={styles.disclaimer}>
            Beregnet som et annuitetslån med like store terminbeløp gjennom
            hele nedbetalingstiden. Faktiske betingelser fra banken kan
            avvike.
          </p>
        </div>
      </div>
    </div>
  );
}
