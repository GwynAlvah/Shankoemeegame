import type { Card } from '.';

export class GameRules {
  static calculateScore(hand: Card[]): number {
    const sum = hand.reduce((acc, card) => {
      const value = card.rank >= 10 ? 0 : card.rank;
      return acc + value;
    }, 0);
    return sum % 10;
  }

  static calculateMultiplier(hand: Card[]): number {
    if (hand.length === 2) {
      if (hand[0].rank === hand[1].rank || hand[0].suit === hand[1].suit) return 2;
    } else if (hand.length === 3) {
      if ((hand[0].rank === hand[1].rank && hand[1].rank === hand[2].rank) ||
          (hand[0].suit === hand[1].suit && hand[1].suit === hand[2].suit)) return 3;
    }
    return 1;
  }

  static compareHands(houseHand: Card[], playerHand: Card[]): number {
    const houseScore = this.calculateScore(houseHand);
    const playerScore = this.calculateScore(playerHand);
    return houseScore >= playerScore ? 1 : -1;
  }
}
