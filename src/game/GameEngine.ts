import {
  PlayerType,
  GamePhase,
  INITIAL_HOUSE_POT,
  MAX_HOUSE_ROUNDS,
  GameEvent
} from '.';
import type {
  GameState,
  Player,
  Card
} from '.';
import { Deck } from './Deck';
import { GameRules } from './GameRules';

export class GameEngine {
  private state: GameState;
  private deck: Deck;

  constructor(players: Player[]) {
    this.deck = new Deck();
    this.state = {
      players: players.map(p => ({ 
        ...p, 
        type: PlayerType.PLAYER, 
        hand: [], 
        currentBet: 0, 
        isReady: false, 
        hasStayed: false 
      })),
      houseId: '',
      pot: 0,
      currentRound: 0,
      phase: GamePhase.BETTING,
      deck: [],
      activePlayerIndex: 0,
      lastEvent: GameEvent.NONE,
      message: 'Welcome to Shan Koe Meee!',
      bettingTimer: 15,
      decisionTimer: 15
    };
    this.initializeFirstHouse();
  }

  tickBettingTimer() {
    if (this.state.phase === GamePhase.BETTING && this.state.bettingTimer > 0) {
      this.state.bettingTimer--;
      if (this.state.bettingTimer === 0) {
        // Auto-place minimum bets for any players who haven't bet
        this.state.players.forEach(p => {
          if (p.type === PlayerType.PLAYER && !p.isReady) {
            this.placeBet(p.id, 100); // Auto-bet 100
          }
        });
        this.startDealing();
      }
    }
  }

  tickDecisionTimer() {
    if (this.state.phase === GamePhase.DECISION && this.state.decisionTimer > 0) {
      this.state.decisionTimer--;
      if (this.state.decisionTimer === 0) {
        const currentPlayer = this.state.players[this.state.activePlayerIndex];
        if (currentPlayer) {
          this.handleDecision(currentPlayer.id, 'stay');
        }
      }
    }
  }

  getState(): GameState {
    return { ...this.state, players: this.state.players.map(p => ({ ...p })) };
  }

  private initializeFirstHouse() {
    const randomIndex = Math.floor(Math.random() * this.state.players.length);
    const firstHouse = this.state.players[randomIndex];
    this.state.firstHouseId = firstHouse.id; // Record the very first house
    this.setupNewHouse(firstHouse.id);
  }

  private setupNewHouse(newHouseId: string) {
    this.state.houseId = newHouseId;
    this.state.pot = INITIAL_HOUSE_POT;
    this.state.currentRound = 1;
    this.state.phase = GamePhase.BETTING;
    this.state.message = `New House: Player ${newHouseId}. Round 1 Start!`;
    this.state.bettingTimer = 15;

    this.state.players.forEach(p => {
      p.type = p.id === newHouseId ? PlayerType.HOUSE : PlayerType.PLAYER;
      if (p.id === newHouseId) p.balance -= INITIAL_HOUSE_POT;
      p.currentBet = 0;
      p.hand = [];
      p.isReady = false;
      p.hasStayed = false;
      p.lastWin = undefined;
    });
  }

  placeBet(playerId: string, amount: number) {
    if (this.state.phase !== GamePhase.BETTING) return;
    const player = this.state.players.find(p => p.id === playerId);
    if (!player || player.type === PlayerType.HOUSE) return;

    if (amount > this.state.pot) {
      this.state.message = "Bet cannot exceed the Pot!";
      return;
    }

    const bettingFee = Math.floor(amount * 0.01);
    const netBet = amount - bettingFee;
    
    player.currentBet = netBet; // The active bet is the amount minus the fee
    player.balance -= amount;   // Total taken from balance is the original amount
    player.isReady = true;

    const readyPlayers = this.state.players.filter(p => p.type === PlayerType.PLAYER && p.isReady);
    if (readyPlayers.length === this.state.players.length - 1) {
      this.startDealing();
    } else {
      this.state.message = `Waiting for others to bet... (${readyPlayers.length + 1}/${this.state.players.length})`;
    }
  }

  private startDealing() {
    this.state.phase = GamePhase.DEALING;
    this.state.message = "Dealing Cards...";
    this.deck.reset();
    this.deck.shuffle();

    this.state.players.forEach(p => {
      p.hand = [this.deck.draw()!, this.deck.draw()!];
      p.lastWin = undefined;
    });

    // Reorder activePlayerIndex logic to make house last
    // We will find all non-house players first, then the house
    const playerOrder = [
        ...this.state.players.filter(p => p.id !== this.state.houseId),
        this.state.players.find(p => p.id === this.state.houseId)!
    ];
    
    // Instead of reordering the actual array (which might break slot indices),
    // we'll update the logic in handleDecision to skip the house until the end.
    // Actually, it's easier to just set activePlayerIndex to the first non-house player.
    // Since our logic currently just increments index, let's find the first non-house player.
    
    this.state.phase = GamePhase.DECISION;
    
    // Find the first player who isn't the house to start
    const firstPlayerIndex = this.state.players.findIndex(p => p.id !== this.state.houseId);
    this.state.activePlayerIndex = firstPlayerIndex;
    this.state.decisionTimer = 15;
    this.updateDecisionMessage();
  }

  handleDecision(playerId: string, decision: 'draw' | 'stay') {
    if (this.state.phase !== GamePhase.DECISION) return;
    const player = this.state.players[this.state.activePlayerIndex];
    if (player.id !== playerId) return;

    if (decision === 'draw' && player.hand.length < 3) {
      player.hand.push(this.deck.draw()!);
    }
    player.hasStayed = true;

    // Logic to move to next player, skipping house until the very end
    let nextIndex = (this.state.activePlayerIndex + 1) % this.state.players.length;
    
    // If the next player is the house, and we haven't finished all other players yet
    const remainingNonHouse = this.state.players.filter((p, idx) => 
        p.id !== this.state.houseId && !p.hasStayed
    );

    if (this.state.players[nextIndex].id === this.state.houseId && remainingNonHouse.length > 0) {
        // Skip house for now, find next non-house
        nextIndex = this.state.players.findIndex((p, idx) => p.id !== this.state.houseId && !p.hasStayed);
    }

    // If all non-house players have stayed, and we are not currently at the house, go to house
    if (remainingNonHouse.length === 0 && player.id !== this.state.houseId) {
        nextIndex = this.state.players.findIndex(p => p.id === this.state.houseId);
    } else if (remainingNonHouse.length === 0 && player.id === this.state.houseId) {
        // House just finished, go to showdown
        this.state.phase = GamePhase.SHOWDOWN;
        this.state.message = "SHOWDOWN! Reveals...";
        return;
    }

    this.state.activePlayerIndex = nextIndex;
    this.state.decisionTimer = 15;
    this.updateDecisionMessage();
  }

  private updateDecisionMessage() {
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    this.state.message = `${activePlayer.name}'s turn to decide.`;
  }

  resolveRound() {
    if (this.state.phase !== GamePhase.SHOWDOWN) return;
    this.state.phase = GamePhase.RESULT;

    const house = this.state.players.find(p => p.id === this.state.houseId)!;
    const houseScore = GameRules.calculateScore(house.hand);
    let houseNetWin = 0;

    this.state.players.forEach(p => {
      if (p.id === this.state.houseId) return;

      const playerScore = GameRules.calculateScore(p.hand);
      const playerWins = playerScore > houseScore;

      if (playerWins) {
        const mult = GameRules.calculateMultiplier(p.hand);
        const winnings = p.currentBet * mult;
        const actualWinFromPot = Math.min(winnings, this.state.pot);
        
        // 1% Winning Fee
        const winFee = Math.floor(actualWinFromPot * 0.01);
        const netWin = actualWinFromPot - winFee;
        
        this.state.pot -= actualWinFromPot;
        p.balance += (p.currentBet + netWin);
        p.lastWin = netWin;
        houseNetWin -= actualWinFromPot;
      } else {
        const houseGain = p.currentBet;
        this.state.pot += houseGain;
        p.lastWin = -houseGain;
        houseNetWin += houseGain;
      }
      p.currentBet = 0;
    });

    house.lastWin = houseNetWin;
    this.state.message = "Round Results are in!";
  }

  nextRound() {
    if (this.state.phase !== GamePhase.RESULT) return;

    if (this.state.pot <= 0) {
      this.state.message = "Pot Empty! Rotating House...";
      this.rotateHouse();
    } else if (this.state.currentRound >= MAX_HOUSE_ROUNDS) {
      this.state.message = "5 Rounds Complete! House keeps the pot (5% fee applied).";
      const house = this.state.players.find(p => p.id === this.state.houseId)!;
      
      const houseFee = Math.floor(this.state.pot * 0.05);
      const netPot = this.state.pot - houseFee;
      
      house.balance += netPot;
      this.state.pot = 0;
      this.rotateHouse();
    } else {
      this.state.currentRound++;
      this.state.phase = GamePhase.BETTING;
      this.state.bettingTimer = 15;
      this.state.message = `Round ${this.state.currentRound} Start! Place bets.`;
      this.state.players.forEach(p => {
        p.hand = [];
        p.lastWin = undefined;
        p.hasStayed = false;
        p.isReady = false;
        p.currentBet = 0;
      });
    }
  }

  private rotateHouse() {
    const currentIndex = this.state.players.findIndex(p => p.id === this.state.houseId);
    const nextIndex = (currentIndex + 1) % this.state.players.length;
    
    // If the next house would be the very first one we started with, the lap is done
    if (this.state.players[nextIndex].id === this.state.firstHouseId) {
        this.state.message = "Tournament Complete! Returning to lobby...";
        this.state.phase = GamePhase.CLEANUP;
        return;
    }

    this.setupNewHouse(this.state.players[nextIndex].id);
  }
}
