'use client';

import React from 'react';

export default function Logo({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-border" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#818CF8" />
          <stop offset="0.5" stopColor="#6366F1" />
          <stop offset="1" stopColor="#A855F7" />
        </linearGradient>
        <linearGradient id="logo-core" x1="8" y1="8" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#38BDF8" />
          <stop offset="0.6" stopColor="#818CF8" />
          <stop offset="1" stopColor="#C084FC" />
        </linearGradient>
        <filter id="glow" x="-2" y="-2" width="36" height="36" filterUnits="userSpaceOnUse">
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Hexagonal Intelligence Shield */}
      <path
        d="M16 3.5L26.5 9.5V22.5L16 28.5L5.5 22.5V9.5L16 3.5Z"
        stroke="url(#logo-border)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Internal Neural Core Diamond */}
      <path
        d="M16 9.5L21.5 15L16 22.5L10.5 15L16 9.5Z"
        fill="url(#logo-core)"
        fillOpacity="0.8"
      />

      {/* Central Radiance Accent */}
      <circle cx="16" cy="15" r="2.2" fill="#FFFFFF" filter="url(#glow)" />
    </svg>
  );
}
