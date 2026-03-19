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
    colorGrading: boolean;
    filmGrain: boolean;
    vignette: boolean;
    chromaticAberration: boolean;
  }
> = {
  high: {
    starCount: 5000,
    bloomEnabled: true,
    nebulaEnabled: true,
    warpShader: true,
    colorGrading: true,
    filmGrain: true,
    vignette: true,
    chromaticAberration: true,
  },
  medium: {
    starCount: 2500,
    bloomEnabled: true,
    nebulaEnabled: true,
    warpShader: true,
    colorGrading: true,
    filmGrain: false,
    vignette: true,
    chromaticAberration: true,
  },
  low: {
    starCount: 1000,
    bloomEnabled: true,
    nebulaEnabled: false,
    warpShader: true,
    colorGrading: false,
    filmGrain: false,
    vignette: true,
    chromaticAberration: false,
  },
  minimal: {
    starCount: 400,
    bloomEnabled: false,
    nebulaEnabled: false,
    warpShader: false,
    colorGrading: false,
    filmGrain: false,
    vignette: false,
    chromaticAberration: false,
  },
};

/** Shard color constants — galaxy-of-nodes palette: amber / teal / coral */
export const SHARD_COLORS: Record<number, string> = {
  0: '#e8a849', // warm amber
  1: '#4ecdc4', // teal
  2: '#e06c75', // coral
  4294967295: '#ffffff', // metachain (white)
};

/** BoN chain constants */
export const BON_CONFIG = {
  chainId: 'B',
  apiUrl: 'https://api.battleofnodes.com',
  explorerUrl: 'https://explorer.battleofnodes.com',
  targetBlockTime: 600, // ms
  roundDuration: 27_000, // ms — 27s round, ends before the kick drum at ~28s in the pulse track
  maxTaps: 50,
  rateLimit: 5, // taps per second
  txGasLimit: 50_000n,
  txValue: 0n,
} as const;
