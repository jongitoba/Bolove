"use client";

import { useId, useMemo, useState } from "react";
import { calculateAnnuityLoan, formatKr } from "@/lib/loan";
import styles from "./eierbrok.module.css";

const MIN_PEOPLE = 2;
const MAX_PEOPLE = 4;
const MAX_NAME_LENGTH = 15;

type Person = {
  name: string;
  egenkapital: number;
  termYears: number;
  interestRate: number;
  terminFee: number;
};

function defaultPerson(index: number): Person {
  return {
    name: `Person ${index + 1}`,
    egenkapital: 1_000_000,
    termYears: 30,
    interestRate: 5.19,
    terminFee: 49,
  };
}

export default function EierbrokApp() {
  const [totalCost, setTotalCost] = useState(5_000_000);
  const [people, setPeople] = useState<Person[]>([defaultPerson(0), defaultPerson(1)]);

  const totalCostId = useId();
  // Fixed-size id pool (rules of hooks forbid calling useId per array item),
  // sliced down to however many people are actually in the list right now.
  const personIds = [useId(), useId(), useId(), useId()];

  function addPerson() {
    setPeople((prev) =>
      prev.length < MAX_PEOPLE ? [...prev, defaultPerson(prev.length)] : prev,
    );
  }

  function removePerson(index: number) {
    setPeople((prev) => (prev.length > MIN_PEOPLE ? prev.filter((_, i) => i !== index) : prev));
  }

  function updatePerson(index: number, patch: Partial<Person>) {
    setPeople((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  const { totalEgenkapital, totalLoanNeeded, combinedMonthlyPayment, results } = useMemo(() => {
    const totalEgenkapital = people.reduce((sum, p) => sum + p.egenkapital, 0);
    const totalLoanNeeded = totalCost - totalEgenkapital;

    const results = people.map((p) => {
      const ownershipPercent =
        totalEgenkapital > 0 ? (p.egenkapital / totalEgenkapital) * 100 : 100 / people.length;
      const ownershipValue = totalCost * (ownershipPercent / 100);
      const loanAmount = Math.max(0, ownershipValue - p.egenkapital);
      const { monthlyPayment, totalInterest } = calculateAnnuityLoan(
        loanAmount,
        p.interestRate,
        p.termYears,
      );
      const numPayments = p.termYears * 12;
      const totalTerminFees = p.terminFee * numPayments;
      const totalMonthlyPayment = monthlyPayment + p.terminFee;
      const totalRepayment = loanAmount + totalInterest + totalTerminFees;

      return {
        ownershipPercent,
        ownershipValue,
        loanAmount,
        totalMonthlyPayment,
        totalInterest,
        totalTerminFees,
        totalRepayment,
      };
    });

    const combinedMonthlyPayment = results.reduce((sum, r) => sum + r.totalMonthlyPayment, 0);

    return { totalEgenkapital, totalLoanNeeded, combinedMonthlyPayment, results };
  }, [totalCost, people]);

  const equityExceedsPrice = totalEgenkapital > totalCost;

  return (
    <div className={styles.wrap}>
      <h1>Eierbrøk</h1>
      <p className={styles.intro}>
        Skal dere kjøpe bolig sammen? Fordel eierandel etter hvor mye
        egenkapital hver av dere skyter inn, og se en egen nedbetalingsplan
        for hver person.
      </p>

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

        <div className={styles.countRow}>
          <span className={styles.countLabel}>Antall personer</span>
          <div className={styles.countButtons}>
            {Array.from({ length: MAX_PEOPLE - MIN_PEOPLE + 1 }, (_, i) => MIN_PEOPLE + i).map(
              (count) => (
                <button
                  key={count}
                  type="button"
                  className={`${styles.countButton} ${
                    people.length === count ? styles.countButtonActive : ""
                  }`}
                  onClick={() => {
                    if (count > people.length) {
                      setPeople((prev) => [
                        ...prev,
                        ...Array.from({ length: count - prev.length }, (_, i) =>
                          defaultPerson(prev.length + i),
                        ),
                      ]);
                    } else if (count < people.length) {
                      setPeople((prev) => prev.slice(0, count));
                    }
                  }}
                >
                  {count}
                </button>
              ),
            )}
          </div>
        </div>

        <div className={styles.summaryStats}>
          <div className={styles.summaryStat}>
            <span className={styles.summaryLabel}>Samlet egenkapital</span>
            <span className={styles.summaryValue}>{formatKr(totalEgenkapital)}</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryLabel}>Totalt lånebehov</span>
            <span className={styles.summaryValue}>{formatKr(Math.max(0, totalLoanNeeded))}</span>
          </div>
          <div className={styles.summaryStat}>
            <span className={styles.summaryLabel}>Samlet betaling per måned</span>
            <span className={styles.summaryValue}>{formatKr(combinedMonthlyPayment)}</span>
          </div>
        </div>

        {equityExceedsPrice && (
          <p className={styles.warning}>
            Samlet egenkapital er høyere enn boligens totalpris. Tallene under
            gir ikke mening før egenkapitalen justeres ned.
          </p>
        )}
      </div>

      <div className={styles.personGrid}>
        {people.map((person, index) => {
          const ids = personIds[index];
          const result = results[index];

          return (
            <div className={styles.personCard} key={index}>
              <div className={styles.personHeader}>
                <input
                  type="text"
                  className={styles.personTitleInput}
                  value={person.name}
                  placeholder={`Person ${index + 1}`}
                  maxLength={MAX_NAME_LENGTH}
                  aria-label={`Navn på person ${index + 1}`}
                  onChange={(e) =>
                    updatePerson(index, { name: e.target.value.slice(0, MAX_NAME_LENGTH) })
                  }
                />
                <span className={styles.ownershipBadge}>
                  {result.ownershipPercent.toFixed(1)} %
                </span>
              </div>

              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor={`${ids}-egenkapital`}>Egenkapital</label>
                  <span className={styles.value}>{formatKr(person.egenkapital)}</span>
                </div>
                <input
                  id={`${ids}-egenkapital`}
                  type="range"
                  min={0}
                  max={totalCost}
                  step={10_000}
                  value={person.egenkapital}
                  onChange={(e) => updatePerson(index, { egenkapital: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className={styles.numberInput}
                  min={0}
                  step={10_000}
                  value={person.egenkapital}
                  onChange={(e) =>
                    updatePerson(index, { egenkapital: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor={`${ids}-term`}>Nedbetalingstid</label>
                  <span className={styles.value}>{person.termYears} år</span>
                </div>
                <input
                  id={`${ids}-term`}
                  type="range"
                  min={1}
                  max={30}
                  step={1}
                  value={person.termYears}
                  onChange={(e) => updatePerson(index, { termYears: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className={styles.numberInput}
                  min={1}
                  max={50}
                  step={1}
                  value={person.termYears}
                  onChange={(e) =>
                    updatePerson(index, { termYears: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor={`${ids}-rente`}>Lånerente</label>
                  <span className={styles.value}>{person.interestRate.toFixed(2)} %</span>
                </div>
                <input
                  id={`${ids}-rente`}
                  type="range"
                  min={0}
                  max={10}
                  step={0.01}
                  value={person.interestRate}
                  onChange={(e) => updatePerson(index, { interestRate: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className={styles.numberInput}
                  min={0}
                  max={20}
                  step={0.01}
                  value={person.interestRate}
                  onChange={(e) =>
                    updatePerson(index, {
                      interestRate: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
              </div>

              <div className={styles.field}>
                <div className={styles.fieldHeader}>
                  <label htmlFor={`${ids}-fee`}>Terminavgift</label>
                  <span className={styles.value}>{formatKr(person.terminFee)}</span>
                </div>
                <input
                  id={`${ids}-fee`}
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={person.terminFee}
                  onChange={(e) => updatePerson(index, { terminFee: Number(e.target.value) })}
                />
                <input
                  type="number"
                  className={styles.numberInput}
                  min={0}
                  step={1}
                  value={person.terminFee}
                  onChange={(e) =>
                    updatePerson(index, { terminFee: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>

              <div className={styles.resultHighlight}>
                <span className={styles.resultLabel}>Du må betale banken per måned</span>
                <span className={styles.resultValue}>{formatKr(result.totalMonthlyPayment)}</span>
              </div>

              <dl className={styles.resultList}>
                <div className={styles.resultRow}>
                  <dt>Eierskapsverdi</dt>
                  <dd>{formatKr(result.ownershipValue)}</dd>
                </div>
                <div className={styles.resultRow}>
                  <dt>Egenkapital</dt>
                  <dd>{formatKr(person.egenkapital)}</dd>
                </div>
                <div className={styles.resultDivider} />
                <div className={styles.resultRow}>
                  <dt>Lånebeløp</dt>
                  <dd>{formatKr(result.loanAmount)}</dd>
                </div>
                <div className={styles.resultRow}>
                  <dt>Rentekostnader</dt>
                  <dd>{formatKr(result.totalInterest)}</dd>
                </div>
                <div className={styles.resultRow}>
                  <dt>Terminavgifter</dt>
                  <dd>{formatKr(result.totalTerminFees)}</dd>
                </div>
                <div className={`${styles.resultRow} ${styles.resultRowTotal}`}>
                  <dt>Lånet vil totalt koste</dt>
                  <dd>{formatKr(result.totalRepayment)}</dd>
                </div>
              </dl>

              {people.length > MIN_PEOPLE && (
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={() => removePerson(index)}
                >
                  Fjern person
                </button>
              )}
            </div>
          );
        })}
      </div>

      {people.length < MAX_PEOPLE && (
        <button type="button" className={styles.addButton} onClick={addPerson}>
          + Legg til person
        </button>
      )}

      <p className={styles.disclaimer}>
        Eierandel beregnes ut fra hver persons andel av samlet egenkapital, og
        hver persons lån beregnes som et annuitetslån med like store
        terminbeløp. Faktiske betingelser fra banken kan avvike.
      </p>
    </div>
  );
}
