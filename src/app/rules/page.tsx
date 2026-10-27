'use client';

import React from 'react';
import Navigation from '@/components/Navigation';
import RulesTab from '@/components/rules/RulesTab';

export default function RulesPage() {
  return (
    <div className="w-full h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Navigation />
      <main className="w-full flex-1 min-h-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col overflow-hidden">
        <div className="mb-4 shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Rules & AI Auto-Purge</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure custom exclusion filters and inspect nonsense emails filtered by the AI.
          </p>
        </div>
        <RulesTab />
      </main>
    </div>
  );
}
