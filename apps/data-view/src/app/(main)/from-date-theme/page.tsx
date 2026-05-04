export default function FromDateThemePage() {
  return (
    <div
      style={{
        padding: "var(--space-6)",
        maxWidth: 1200,
        margin: "0 auto",
      }}
    >
      <h1
        style={{
          fontSize: "var(--fs-3xl)",
          fontWeight: "var(--fw-bold)",
          marginBottom: "var(--space-2)",
        }}
      >
        From Date &amp; Theme
      </h1>
      <p
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-md)",
          marginBottom: "var(--space-6)",
        }}
      >
        날짜·테마로 시장을 둘러보는 모드 (준비 중)
      </p>

      <div
        style={{
          padding: "var(--space-10)",
          background: "var(--bg-secondary)",
          border: "1px dashed var(--border-default)",
          borderRadius: "var(--radius-lg)",
          textAlign: "center",
          color: "var(--text-muted)",
        }}
      >
        🚧 준비 중 — v0.3 에서 구현 예정
      </div>
    </div>
  );
}
