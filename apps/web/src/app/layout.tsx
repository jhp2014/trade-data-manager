import "./globals.css";

export const metadata = {
    title: "Trade Data Manager",
    description: "Advanced Trading Dashboard",
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