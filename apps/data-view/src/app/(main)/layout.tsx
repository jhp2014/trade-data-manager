import { Header } from "@/components/layout/Header";
import { SideRail } from "@/components/layout/SideRail";
import { SidePanel } from "@/components/layout/SidePanel";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      <Header />
      <main
        style={{
          // 우측 사이드 레일만큼 padding 확보
          paddingRight: "var(--side-rail-w)",
          minHeight: "calc(100vh - var(--header-h))",
        }}
      >
        {children}
      </main>
      <SidePanel />
      <SideRail />
    </div>
  );
}
