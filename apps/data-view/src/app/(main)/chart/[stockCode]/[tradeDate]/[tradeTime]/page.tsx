interface PageProps {
  params: {
    stockCode: string;
    tradeDate: string;
    tradeTime: string;
  };
}

export default function ChartDetailPage({ params }: PageProps) {
  const tradeTime = decodeURIComponent(params.tradeTime);

  return (
    <div
      style={{
        padding: "var(--space-6)",
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          marginBottom: "var(--space-4)",
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-sm)",
        }}
      >
        ← 뒤로
      </div>
      <h1
        style={{
          fontSize: "var(--fs-3xl)",
          fontWeight: "var(--fw-bold)",
          marginBottom: "var(--space-2)",
        }}
      >
        {params.stockCode} 상세 차트
      </h1>
      <p
        style={{
          color: "var(--text-tertiary)",
          fontSize: "var(--fs-md)",
          marginBottom: "var(--space-6)",
        }}
      >
        {params.tradeDate} {tradeTime}
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-4)",
          marginBottom: "var(--space-4)",
        }}
      >
        <Placeholder title="일봉" />
        <Placeholder title="분봉" />
      </div>
      <Placeholder title="테마 오버레이" tall />
    </div>
  );
}

function Placeholder({ title, tall }: { title: string; tall?: boolean }) {
  return (
    <div
      style={{
        padding: "var(--space-5)",
        background: "var(--bg-secondary)",
        border: "1px dashed var(--border-default)",
        borderRadius: "var(--radius-lg)",
        height: tall ? 360 : 240,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--text-muted)",
      }}
    >
      🚧 {title} — v0.2에서 실 차트 연동 예정
    </div>
  );
}
