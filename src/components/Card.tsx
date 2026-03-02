import React from 'react';
import './Card.css';

interface CardProps {
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  rank: number;
  faceUp?: boolean;
}

const getSuitSymbol = (suit: string) => {
  switch (suit) {
    case 'spades': return '♠';
    case 'hearts': return '♥';
    case 'diamonds': return '♦';
    case 'clubs': return '♣';
    default: return '';
  }
};

const getRankLabel = (rank: number) => {
  switch (rank) {
    case 1: return 'A';
    case 11: return 'J';
    case 12: return 'Q';
    case 13: return 'K';
    default: return rank.toString();
  }
};

export const Card: React.FC<CardProps> = ({ suit, rank, faceUp = true }) => {
  const isRed = suit === 'hearts' || suit === 'diamonds';
  const symbol = getSuitSymbol(suit);
  const label = getRankLabel(rank);

  if (!faceUp) {
    return (
      <div className="card card-back">
        <div className="card-pattern" />
      </div>
    );
  }

  return (
    <div className={`card card-face ${isRed ? 'red' : 'black'}`}>
      <div className="card-top-left">
        <div className="card-rank">{label}</div>
        <div className="card-suit">{symbol}</div>
      </div>
      <div className="card-center">
        <div className="card-suit-large">{symbol}</div>
      </div>
      <div className="card-bottom-right">
        <div className="card-rank">{label}</div>
        <div className="card-suit">{symbol}</div>
      </div>
    </div>
  );
};
