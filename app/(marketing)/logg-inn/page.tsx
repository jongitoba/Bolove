import { signInWithEmail } from "./actions";
import styles from "./page.module.css";

const ERROR_MESSAGES: Record<string, string> = {
  Verification:
    "Lenken er utløpt eller allerede brukt. Be om en ny innloggingslenke under.",
};

export default async function LoggInnPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Noe gikk galt. Prøv igjen.")
    : null;

  return (
    <div className={styles.wrap}>
      <h1>Logg inn</h1>
      <p>Skriv inn e-posten din, så sender vi deg en innloggingslenke.</p>
      {errorMessage && <p className={styles.error}>{errorMessage}</p>}
      <form action={signInWithEmail} className={styles.form}>
        <input
          type="email"
          name="email"
          placeholder="din@epost.no"
          required
          className={styles.input}
        />
        <button type="submit" className={styles.button}>
          Send innloggingslenke
        </button>
      </form>
    </div>
  );
}
