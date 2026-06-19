import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";
import { Nav } from "@/components/Nav";
import styles from "./layout.module.css";

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
            <head>
                <link
                    rel="stylesheet"
                    href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
                />
            </head>
            <body>
                <QueryProvider>
                    <Nav />
                    <main className={styles.appmain}>{children}</main>
                </QueryProvider>
            </body>
        </html>
    );
}
