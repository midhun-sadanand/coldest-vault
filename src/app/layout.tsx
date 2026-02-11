import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  metadataBase: new URL('https://coldest-vault.vercel.app'),
  title: 'Vault',
  description: 'Search and explore historical document archives',
  icons: {
    icon: '/favicon.svg',
  },
  openGraph: {
    title: 'Vault',
    description: 'Search and explore historical document archives',
    images: ['/favicon.png'],
  },
  twitter: {
    card: 'summary',
    title: 'Vault',
    description: 'Search and explore historical document archives',
    images: ['/favicon.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                const theme = localStorage.getItem('theme');
                const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                const resolved = theme === 'light' ? 'light' : theme === 'dark' ? 'dark' : (systemDark ? 'dark' : 'light');
                document.documentElement.classList.add(resolved);
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)] antialiased">
        <ThemeProvider>
          <Header />
          <main className="flex-1">{children}</main>
          <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
