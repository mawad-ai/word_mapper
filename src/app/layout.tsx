import type { Metadata } from 'next';
import '@/app/globals.scss';
import { ThemeProvider } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Word Mapper',
  description: 'Translation tool with word alignment visualization',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
