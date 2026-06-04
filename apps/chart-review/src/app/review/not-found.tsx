import Link from "next/link";

/**
 * 복기 섹션 전용 404 페이지.
 * notFound()가 호출될 때(읽기 시트 탭이 비어 있거나 시트 미설정) 표시된다.
 */
export default function ReviewNotFound() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        gap: "12px",
        fontFamily: "system-ui, sans-serif",
        color: "var(--text-secondary, #5a6778)",
        background: "var(--bg-secondary, #f4f6f8)",
      }}
    >
      <div
        style={{
          fontSize: "40px",
          fontWeight: 800,
          color: "var(--text-tertiary, #8f9aaa)",
          letterSpacing: "-0.02em",
        }}
      >
        데이터 없음
      </div>
      <p style={{ margin: 0, fontSize: "14px", textAlign: "center", lineHeight: 1.6 }}>
        읽기 시트 탭에 작업셋 데이터가 없거나 시트가 설정되지 않았습니다.
        <br />
        설정에서 읽기 탭을 변경하거나 시트에 종목 데이터를 추가한 뒤 다시 접속하세요.
      </p>
      <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
        <Link
          href="/review"
          style={{
            padding: "9px 20px",
            borderRadius: "10px",
            background: "var(--accent-primary, #2563eb)",
            color: "#fff",
            fontWeight: 700,
            fontSize: "13.5px",
            textDecoration: "none",
          }}
        >
          복기 홈으로
        </Link>
        <Link
          href="/"
          style={{
            padding: "9px 20px",
            borderRadius: "10px",
            border: "1px solid var(--border-default, #d8dde5)",
            background: "var(--bg-primary, #fff)",
            color: "var(--text-secondary, #5a6778)",
            fontWeight: 600,
            fontSize: "13.5px",
            textDecoration: "none",
          }}
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}
