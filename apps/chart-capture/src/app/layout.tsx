import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "chart-capture",
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="ko">
            <head>
                <style>{`
                    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
                    html, body { width: 100%; height: 100%; background: #ffffff; }
                `}</style>
            </head>
            <body>{children}</body>
        </html>
    );
}
