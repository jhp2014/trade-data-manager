import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
    title: "Hypothesis Lab",
    description: "가설을 caseId 로 chart-review 와 얇게 연결해 관리하는 View/Edit Layer",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body>{children}</body>
        </html>
    );
}
