import type { Metadata } from 'next';
import './globals.css';
import { RealtimeProvider } from '@/components/RealtimeProvider';
import Navigation from '@/components/Navigation';

export const metadata: Metadata = {
  title: 'Personal Assistant — AI Executive Triage & Action Hub',
  description: 'Enterprise-grade executive personal assistant with real-time Supabase sync, IMAP/SMTP mailboxes, WhatsApp bridge, and Gemini AI triage.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full w-full overflow-hidden">
      <body className="bg-slate-950 text-slate-100 h-full w-full overflow-hidden flex flex-col antialiased selection:bg-indigo-500 selection:text-white">
        <RealtimeProvider>
          {children}
        </RealtimeProvider>
      </body>
    </html>
  );
}
