import { StatsResponse } from './types';

class StatsStore {
  private data: Map<string, number> = new Map([
    ['totalPlayers', 0],
    ['totalTaps', 0],
    ['totalConstellations', 0],
  ]);

  increment(key: 'totalPlayers' | 'totalTaps' | 'totalConstellations', by: number = 1): void {
    const current = this.data.get(key) ?? 0;
    this.data.set(key, current + by);
  }

  getAll(): StatsResponse {
    return {
      totalPlayers: this.data.get('totalPlayers') ?? 0,
      totalTaps: this.data.get('totalTaps') ?? 0,
      totalConstellations: this.data.get('totalConstellations') ?? 0,
    };
  }
}

export const stats = new StatsStore();
