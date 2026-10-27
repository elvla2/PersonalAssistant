import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-4">
      <div className="text-center space-y-4 max-w-md p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
        <h1 className="text-6xl font-black text-indigo-500">404</h1>
        <h2 className="text-xl font-bold text-white">Page Not Found</h2>
        <p className="text-sm text-slate-400">
          The requested assistant view or route does not exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Action Briefing</span>
        </Link>
      </div>
    </div>
  );
}
