import React from 'react';

export const CrownIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="#fbbf24" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 16L3 5L8.5 10L12 4L15.5 10L21 5L19 16H5ZM19 19C19 19.5523 18.5523 20 18 20H6C5.44772 20 5 19.5523 5 19V18H19V19Z" />
  </svg>
);

export const CoinIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" fill="#fbbf24" fillOpacity="0.2" />
    <path d="M12 8V16" />
    <path d="M9.5 10.5H12.5C13.5 10.5 14.5 11 14.5 12C14.5 13 13.5 13.5 12.5 13.5H9.5V10.5Z" />
    <path d="M11.5 13.5H14.5C15.5 13.5 16.5 14 16.5 15C16.5 16 15.5 16.5 14.5 16.5H11.5" />
    <circle cx="12" cy="12" r="10" />
  </svg>
);

export const BronzeCoinIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="url(#bronzeGradient)" stroke="#78350f" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="6" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
    <defs>
      <linearGradient id="bronzeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#cd7f32', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#78350f', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
  </svg>
);

export const SilverCoinIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="url(#silverGradient)" stroke="#475569" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="6" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1"/>
    <defs>
      <linearGradient id="silverGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#e2e8f0', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#64748b', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
  </svg>
);

export const GoldCoinIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" fill="url(#goldCoinGradient)" stroke="#92400e" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1"/>
    <defs>
      <linearGradient id="goldCoinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: '#fbbf24', stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: '#d97706', stopOpacity: 1 }} />
      </linearGradient>
    </defs>
  </svg>
);

export const TreasureChestIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '8px' }}>
    <path d="M3 10C3 8.89543 3.89543 8 5 8H19C20.1046 8 21 8.89543 21 10V12H3V10Z" fill="#fbbf24" stroke="#78350f" strokeWidth="1.5"/>
    <path d="M3 12V18C3 19.1046 3.89543 20 5 20H19C20.1046 20 21 19.1046 21 18V12H3Z" fill="#f59e0b" stroke="#78350f" strokeWidth="1.5"/>
    <rect x="10" y="10" width="4" height="4" rx="1" fill="#78350f" />
    <circle cx="12" cy="12" r="1" fill="#fbbf24" />
    <path d="M7 8V6C7 4.89543 7.89543 4 9 4H15C16.1046 4 17 4.89543 17 6V8" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const WinOverlay = ({ amount }: { amount: number }) => {
  const isWin = amount > 0;
  if (amount === 0) return null;
  return (
    <div className={`win-overlay ${isWin ? 'is-win' : 'is-loss'}`}>
      <div className="win-text">
        {isWin ? `+${amount}` : `-${Math.abs(amount)}`}
      </div>
    </div>
  );
};
