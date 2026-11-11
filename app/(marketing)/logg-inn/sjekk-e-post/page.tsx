import styles from "../page.module.css";

export default function SjekkEPostPage() {
  return (
    <div className={styles.wrap}>
      <h1>Sjekk e-posten din</h1>
      <p>
        Vi har sendt deg en innloggingslenke. Klikk på lenken i e-posten for å
        logge inn.
      </p>
    </div>
  );
}
