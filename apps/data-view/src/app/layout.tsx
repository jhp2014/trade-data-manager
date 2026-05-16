import type { Metadata } from "next";
import "./globals.css";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
    title: "Data View",
    description: "Trade data manager — stock chart viewer",
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
                <NuqsAdapter>
                    <QueryProvider>{children}</QueryProvider>
                </NuqsAdapter>
            </body>
        </html>
    );
}
