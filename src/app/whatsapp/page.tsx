'use client';

import React from 'react';
import Navigation from '@/components/Navigation';
import WhatsAppTab from '@/components/whatsapp/WhatsAppTab';

export default function WhatsAppPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navigation />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <WhatsAppTab />
      </main>
    </div>
  );
}
