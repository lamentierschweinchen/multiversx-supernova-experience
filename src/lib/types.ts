// ============================================================
// Core data types for the 600ms Supernova experience
// ============================================================

/** Raw block data from the BoN API, normalized */
export interface BlockData {
  nonce: number;
  round: number;
  hash: string;
  proposer: string; // BLS public key hex
  timestamp: number;
  txCount: number;
  gasConsumed: number;
  miniBlocks: MiniBlockData[];
  validators: ValidatorData[];
}

export interface MiniBlockData {
  hash: string;
  senderShard: number;
  receiverShard: number;
  txCount: number;
  type: string;
}

export interface ValidatorData {
  blsKey: string; // BLS public key hex
  shard: number;
}

/** Constellation output — deterministic from BlockData */
export interface ConstellationData {
  blockNonce: number;
  stars: StarData[];
  edges: EdgeData[];
  nebula: NebulaParams;
  centralStar: StarData;
}

export interface StarData {
  x: number; // normalized [-1, 1]
  y: number; // normalized [-1, 1]
  size: number; // 0-1 normalized
  color: string; // hex color
  hue: number; // HSL hue 0-360
  shard: number; // -1 for proposer/meta
  isCentral: boolean;
  blsKeyFragment: string; // first 8 chars for labeling
}

export interface EdgeData {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  style: 'solid' | 'dashed';
  opacity: number;
}

export interface NebulaParams {
  centerX: number;
  centerY: number;
  radius: number; // normalized 0-1
  intensity: number; // 0-1
  hue: number; // dominant hue
}

/** Game state machine */
export type GameState =
  | 'loading'
  | 'gate'
  | 'warp'
  | 'rhythm'
  | 'resolving'
  | 'reveal'
  | 'save';

/** Session from /api/start-round */
export interface GameSession {
  sessionId: string;
  txHashes: string[];
  tapCount: number;
  accuracy: number;
  startedAt: number;
}

/** API response types */
export interface TapResponse {
  txHash: string | null;
  sentAt: number;
  queued?: boolean;
}

export interface ResolveResponse {
  blockNonce: number;
  blockHash: string;
}

export interface StatsResponse {
  totalPlayers: number;
  totalTaps: number;
  totalConstellations: number;
}

/** Performance tier for adaptive rendering */
export type PerformanceTier = 'high' | 'medium' | 'low' | 'minimal';

export const PERFORMANCE_CONFIG: Record<
  PerformanceTier,
  {
    starCount: number;
    bloomEnabled: boolean;
    nebulaEnabled: boolean;
    warpShader: boolean;
  }
> = {
  high: {
    starCount: 4000,
    bloomEnabled: true,
    nebulaEnabled: true,
    warpShader: true,
  },
  medium: {
    starCount: 1500,
    bloomEnabled: true,
    nebulaEnabled: false,
    warpShader: true,
  },
  low: {
    starCount: 600,
    bloomEnabled: true,
    nebulaEnabled: false,
    warpShader: false,
  },
  minimal: {
    starCount: 300,
    bloomEnabled: false,
    nebulaEnabled: false,
    warpShader: false,
  },
};

/** Shard color constants */
export const SHARD_COLORS: Record<number, string> = {
  0: '#00e5ff', // cyan
  1: '#23c483', // green
  2: '#7c3aed', // purple
  4294967295: '#ffffff', // metachain (white)
};

/** BoN chain constants */
export const BON_CONFIG = {
  chainId: 'B',
  apiUrl: 'https://api.battleofnodes.com',
  explorerUrl: 'https://explorer.battleofnodes.com',
  targetBlockTime: 600, // ms
  roundDuration: 30_000, // ms
  maxTaps: 50,
  rateLimit: 5, // taps per second
  txGasLimit: 50_000n,
  txValue: 0n,
} as const;
