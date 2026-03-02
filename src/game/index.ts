export const INITIAL_HOUSE_POT = 5000;
export const MAX_PLAYERS = 5;
export const MAX_HOUSE_ROUNDS = 5;

export enum GamePhase {
  BETTING = 'BETTING',
  DEALING = 'DEALING',
  DECISION = 'DECISION',
  SHOWDOWN = 'SHOWDOWN',
  RESULT = 'RESULT',
  CLEANUP = 'CLEANUP',
}

export enum PlayerType {
  HOUSE = 'HOUSE',
  PLAYER = 'PLAYER',
}

export type CardSuit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export interface Card {
  suit: CardSuit;
  rank: number;
}

export interface Player {
  id: string;
  name: string;
  type: PlayerType;
  balance: number;
  currentBet: number;
  hand: Card[];
  isReady: boolean;
  lastWin?: number;
  hasStayed?: boolean;
}

export enum GameEvent {
  POT_PULSE_HIGH = 'POT_PULSE_HIGH',
  POT_PULSE_LOW = 'POT_PULSE_LOW',
  BANKRUPT = 'BANKRUPT',
  HOUSE_WIN = 'HOUSE_WIN',
  MAX_BET_TENSION = 'MAX_BET_TENSION',
  NONE = 'NONE'
}

export interface GameState {
  players: Player[];
  houseId: string;
  pot: number;
  currentRound: number;
  phase: GamePhase;
  deck: Card[];
  activePlayerIndex: number;
  lastEvent: GameEvent;
  message: string;
  bettingTimer: number;
  decisionTimer: number;
  firstHouseId?: string;
}
