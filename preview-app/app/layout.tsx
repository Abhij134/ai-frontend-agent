import type { Metadata } from 'next';
import { Roboto } from 'next/font/google';
import './globals.css';

// Load Roboto font with specified weights
const roboto = Roboto({
  weight: ['300', '400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-roboto',
});

export const metadata: Metadata = {
  title: 'YouTube Clone',
  description: 'A pixel-perfect YouTube UI clone using Next.js and Tailwind CSS.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Using next/font/google which handles preconnect and optimization */}
      </head>
      {/* Explicitly set light mode background and text colors */}
      <body className={`${roboto.variable} font-sans bg-white text-gray-900`}>
        {children}
      </body>
    </html>
  );
}