import React, { useState } from 'react';
import { CoinIcon } from './Icons';

interface BettingModalProps {
  onBet: (amount: number) => void;
  timeLeft: number;
  maxBet: number;
  balance: number;
}

export const BettingModal: React.FC<BettingModalProps> = ({ onBet, timeLeft, maxBet, balance }) => {
  const [currentBet, setCurrentBet] = useState(0);
  const chips = [100, 500, 1000, 5000, 10000].filter(c => c <= balance);

  const addChip = (val: number) => {
    const limit = Math.min(balance, maxBet);
    if (currentBet + val <= limit) {
      setCurrentBet(prev => prev + val);
    } else if (currentBet < limit) {
      setCurrentBet(limit);
    }
  };

  const setQuickBet = (ratio: number) => {
    const limit = Math.min(balance, maxBet);
    setCurrentBet(Math.floor(limit * ratio));
  };

  const handleConfirm = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (currentBet > 0) {
      onBet(currentBet);
    }
  };

  return (
    <div className="betting-overlay">
      <div className="betting-modal" onClick={e => e.stopPropagation()}>
        <div className="timer-bar-container">
          <div 
            className="timer-bar-fill" 
            style={{ 
              width: `${(timeLeft / 15) * 100}%`,
              backgroundColor: timeLeft < 5 ? '#ef4444' : '#fbbf24',
              color: timeLeft < 5 ? '#ef4444' : '#fbbf24'
            }} 
          />
        </div>

        <div className="bet-stats">
          <div className="bet-stat">
            <div className="label">သင့်လက်ကျန်ငွေ</div>
            <div className="value gold"><CoinIcon /> {balance.toLocaleString()}</div>
          </div>
          <div className="bet-stat">
            <div className="label">ဒိုင်ကန့်သတ်ချက်</div>
            <div className="value">{maxBet.toLocaleString()}</div>
          </div>
        </div>

        <div className="total-bet-display">
          <div className="total-label">လက်ရှိလောင်းကြေး</div>
          <div className="total-value">{currentBet.toLocaleString()}</div>
        </div>

        <div className="quick-actions">
           <button type="button" className="btn-quick" onClick={() => setQuickBet(0.25)}>၁/၄ အများဆုံး</button>
           <button type="button" className="btn-quick" onClick={() => setQuickBet(0.5)}>၁/၂ အများဆုံး</button>
           <button type="button" className="btn-quick" onClick={() => setQuickBet(1)}>အားလုံးလောင်းမည်</button>
        </div>

        <div className="chip-selection">
          {chips.map(val => (
            <button 
              key={val} 
              type="button"
              className={`chip ${val >= 10000 ? 'chip-gold' : val >= 5000 ? 'chip-green' : val >= 1000 ? 'chip-red' : 'chip-blue'}`}
              onClick={() => addChip(val)}
            >
              <div className="chip-inner">{val >= 1000 ? `${val/1000}K` : val}</div>
            </button>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-clear" onClick={() => setCurrentBet(0)}>
            အစမှပြန်လုပ်ရန်
          </button>
          <button 
            type="button"
            className="btn-confirm-bet" 
            onClick={handleConfirm} 
            disabled={currentBet === 0}
          >
            လောင်းကြေးတင်မည်
          </button>
        </div>

        <div className="modal-footer">
          SHAN KOE MEE ရိုးရာကစားနည်း • ၁% ဝန်ဆောင်ခ နှုတ်ယူပါသည်
        </div>
      </div>
    </div>
  );
};
