import styles from "./EmptyState.module.css";

export function EmptyState({
  title,
  body,
  variant = "default",
}: {
  title: string;
  body: string;
  variant?: "default" | "error";
}) {
  return (
    <div
      className={`${styles.empty} ${variant === "error" ? styles.error : ""}`}
    >
      <div className={styles.title}>{title}</div>
      <div className={styles.body}>{body}</div>
    </div>
  );
}
