import type { Metadata } from 'next';
import './globals.css';
import QueryProvider from '@/providers/QueryProvider';

export const metadata: Metadata = {
    title: 'Trading Dashboard',
    description: 'Personal Trading Architecture',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body>
                <QueryProvider>
                    {children}
                </QueryProvider>
            </body>
        </html>
    );
}