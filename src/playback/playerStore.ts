import { createInitialPlayerState, playerReducer, type PlayerAction } from './playerReducer';
import type { PlayerState } from './types';

/**
 * External store holding PlayerState. Engines dispatch; React reads through
 * useSyncExternalStore (see hooks.ts). There is exactly one store per session.
 */
export class PlayerStore {
  private state: PlayerState;
  private readonly listeners = new Set<() => void>();

  constructor(initial: PlayerState = createInitialPlayerState()) {
    this.state = initial;
  }

  getState = (): PlayerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispatch = (action: PlayerAction): void => {
    const next = playerReducer(this.state, action);
    if (next === this.state) return;
    this.state = next;
    for (const listener of this.listeners) listener();
  };
}
