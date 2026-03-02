import React from 'react';

export const ThinkingIndicator = () => (
  <svg width="40" height="10" viewBox="0 0 40 10" xmlns="http://www.w3.org/2000/svg">
    <circle cx="5" cy="5" r="3" fill="#fbbf24">
      <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" begin="0.1s" />
    </circle>
    <circle cx="20" cy="5" r="3" fill="#fbbf24">
      <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" begin="0.2s" />
    </circle>
    <circle cx="35" cy="5" r="3" fill="#fbbf24">
      <animate attributeName="opacity" values="0;1;0" dur="1s" repeatCount="indefinite" begin="0.3s" />
    </circle>
  </svg>
);

export const DealerButton = () => (
  <svg width="45" height="45" viewBox="0 0 50 50" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#fbbf24', stopOpacity: 1 }} />
        <stop offset="50%" style={{ stopColor: '#f59e0b', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#b45309', stopOpacity: 1 }} />
      </linearGradient>
      <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="1.5" />
        <feOffset dx="1" dy="2" result="offsetblur" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.5" />
        </feComponentTransfer>
        <feMerge>
          <feMergeNode />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
    <g filter="url(#badgeShadow)">
      <circle cx="25" cy="25" r="22" fill="url(#goldGradient)" stroke="#78350f" strokeWidth="1.5" />
      <circle cx="25" cy="25" r="18" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" strokeDasharray="2,2" />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fontSize="9" fontWeight="900" fill="#451a03" style={{ letterSpacing: '0.5px' }}>DEALER</text>
    </g>
  </svg>
);

export const TablePattern = () => (
  <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, zIndex: 0, opacity: 0.05, pointerEvents: 'none' }}>
    <defs>
      <pattern id="feltPattern" x="0" y="0" width="100" height="100" patternUnits="userSpaceOnUse">
        <path d="M50 0 L100 50 L50 100 L0 50 Z" fill="none" stroke="white" strokeWidth="0.5" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#feltPattern)" />
  </svg>
);
