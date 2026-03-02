import type { Card } from '.';

export class Deck {
  private cards: Card[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.cards = [];
    const suits: Card['suit'][] = ['spades', 'hearts', 'diamonds', 'clubs'];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        this.cards.push({ suit, rank });
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  draw(): Card | undefined {
    return this.cards.pop();
  }

  get length(): number {
    return this.cards.length;
  }
}
