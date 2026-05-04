import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/providers/QueryProvider";

export const metadata: Metadata = {
    title: "Data View",
    description: "Trade data manager — deck analysis",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body>
                <QueryProvider>{children}</QueryProvider>
            </body>
        </html>
    );
}
