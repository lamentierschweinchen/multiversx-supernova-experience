# 600ms: Enter the Supernova — Design Spec

## Context

The MultiversX Battle of Nodes (BoN) is live — a $150k+ stress-testing competition for the Supernova upgrade, which introduces 600ms block times and async execution. The public tooling for experiencing this is thin: no visualization, no community-facing "feel the chain" tool.

This project creates an immersive 3D web experience that makes 600ms block production tangible for anyone — from crypto-curious newcomers to technical builders. Players enter a cosmic portal, play a rhythm game synced to real blockchain block production, and earn unique star constellations generated from actual network topology data.

The goal: make the Battle of Nodes (and Supernova) something people can experience, not just read about.

## Product Overview

**Name:** 600ms: Enter the Supernova

**One-liner:** An immersive web experience where you play a rhythm game against a blockchain and earn constellations from the stars that processed your transactions.

**Audience layers:**
- **Newcomers:** A beautiful space game. "I couldn't keep up with a blockchain."
- **Community:** Real transactions on the BoN chain. You're stress-testing the network by playing.
- **Developers:** Inspect the full tx lifecycle. See how block proposers, validators, and cross-shard routing map to visual patterns.

**Platform:** Web app (Next.js + Three.js). No wallet required to play. Optional wallet connect to reserve constellations for mainnet mint after Supernova launches.

## Experience Flow

### Scene 0: The Gate

Full-screen 3D starfield rendered in Three.js. Thousands of star particles arranged in depth. A gravitational vortex at center — light bending inward, subtle radial distortion shader. The word "SUPERNOVA" rendered large with distortion/chromatic aberration. Soft camera drift.

On click/scroll: the camera accelerates forward through a warp tunnel. Stars blur into radial light streaks. Tunnel narrows. 3-5 second transition. Then: emergence into the game space.

**Feel:** Theme park ride entrance. Getting pulled in.

### Scene 1: The Rhythm

Floating in deep space. The background starfield pulses every 600ms in sync with real block production on the BoN chain. A central orb (the tap target) glows softly, pulsing with the blockchain's heartbeat.

Player taps/clicks to match the 600ms rhythm:
- **On-beat:** Orb flares bright. Particle burst radiates outward. Nearby stars intensify. Scene gets more vivid.
- **Off-beat:** Dimmer response. Stars contract slightly.
- **Miss:** Field darkens briefly. Stars dim.

Subtle HUD overlay shows: accuracy %, transactions sent count, current block number, live indicator.

Each tap fires a real MoveBalance transaction to the BoN chain via the server. After ~30 seconds (~50 taps), the round ends and transitions to the reveal.

**Feel:** Visceral and responsive. The universe reacts to you. Playful, not punishing.

### Scene 2: The Constellation Reveal

The starfield calms. Camera slowly reorients.

The constellation draws itself over 5-8 seconds:
1. Central star appears (the block proposer) — bright, with a unique color tint derived from the proposer's BLS key hash.
2. Validator nodes bloom outward — colored by shard (cyan = Shard 0, green = Shard 1, purple = Shard 2, white = Metachain).
3. Faint lines trace between stars: cross-shard message paths.
4. Dashed lines appear: async execution routes.
5. Soft nebula glow fills in based on gas consumed.
6. Camera pulls back to reveal the full constellation.

It breathes gently — subtle oscillation.

Text overlay fades in below: block number, shard, transaction count, proposer address fragment.

**Feel:** Reveal moment. Like seeing a Polaroid develop. Quiet awe after the intensity of the game.

### Scene 3: Save and Share

Constellation floats at center. UI overlays appear:

- **Save Image** — exports the Three.js canvas as a high-resolution PNG.
- **Share Link** — unique URL per constellation (`/constellation/:blockNonce`). Visiting it re-renders the constellation deterministically.
- **Connect Wallet** (optional) — connect a mainnet MultiversX wallet. Your constellation is associated with your address. When Supernova launches on mainnet, you can mint it as an NFT.

**Feel:** Satisfying collection moment. The delayed mint creates anticipation.

## Constellation DNA

Each constellation is a deterministic visual fingerprint of how the network processed the block containing the player's transaction. Same block always produces the same constellation.

| Block Data | Visual Element |
|---|---|
| Consensus proposer BLS public key | Central star position (hash → x,y in unit circle) and unique hue (hash → HSL) |
| Participating validator BLS keys | Surrounding star positions (each key hashed to position) |
| Validator shard assignment | Star color: cyan (#00e5ff) = Shard 0, green (#23c483) = Shard 1, purple (#7c3aed) = Shard 2, white = Metachain |
| Cross-shard miniblock count | Number of connecting lines between shard clusters |
| Transaction count in block | Total visible star count / overall density |
| Total gas consumed | Nebula glow radius and intensity |
| Block round | Rotation angle of entire constellation |
| Block nonce | Deterministic jitter seed (ensures blocks with identical topology still look distinct) |

### Which Block Becomes the Constellation?

The player sends ~50 transactions over ~30 seconds. These land across many blocks. **The constellation is generated from the block containing the player's final transaction** — the last tap before the round ends. This block represents the "culmination" of their gameplay.

The server tracks all tx hashes during a session. After the round ends, it resolves the final tx hash to its containing block via `GET /transactions/:hash` (which returns the block nonce). This block nonce is then used to fetch full block details for constellation generation.

### Constellation Generation Algorithm

1. Parse block data from BoN API: proposer, validators list, miniblock details, gas, tx count.
2. Hash each validator's BLS public key to derive (x, y) position in a normalized coordinate space. **Use a seeded xorshift32 PRNG** (seeded with the first 4 bytes of a SHA-256 of the BLS key) rather than `Math.sin`/`Math.cos` to ensure cross-browser determinism.
3. Assign shard colors from the miniblock/shard data.
4. Compute cross-shard edges: for each cross-shard miniblock, draw a line between the source-shard cluster centroid and the destination-shard cluster centroid.
5. Scale nebula glow from gas consumed (normalized against recent block average).
6. Apply block-nonce-seeded jitter to all positions (same xorshift PRNG, seeded with block nonce).
7. Render using Three.js point sprites (stars), line geometry (connections), and a glow shader (nebula).

The algorithm is deterministic: given the same block data, the same constellation is always produced across all browsers and devices. All randomness flows through the seeded xorshift32 PRNG — no floating-point-dependent trigonometry in the position pipeline. Share links work because the URL contains just the block nonce, and the constellation is re-generated client-side from API data.

## Architecture

### Frontend (Next.js + Three.js)

Single continuous Three.js canvas that transitions between scenes. Scene management via a simple state machine: `gate → rhythm → reveal → save`.

```
src/
  app/
    page.tsx                    # Entry: mounts the Three.js experience
    constellation/[nonce]/
      page.tsx                  # Shareable constellation page (re-renders from block data)
    api/
      tap/route.ts              # POST: sends tx, returns tx hash
      block/[hash]/route.ts     # GET: fetches block details from BoN API
      stats/route.ts            # GET: global counters
      reserve/route.ts          # POST: associates wallet address with constellation
  components/
    Experience.tsx              # Three.js canvas mount + scene orchestrator
    HUD.tsx                     # Score/stats overlay (React, positioned over canvas)
    SavePanel.tsx               # Save/share/connect UI (React overlay)
  three/
    scenes/
      GateScene.ts              # Warp tunnel: starfield, vortex, camera acceleration
      RhythmScene.ts            # Game: pulsing stars, tap orb, particle bursts
      RevealScene.ts            # Constellation: star placement, line drawing, nebula
    shaders/
      warp.glsl                 # Radial warp/tunnel distortion
      bloom.glsl                # Glow/bloom post-processing
      nebula.glsl               # Volumetric nebula glow
      star.glsl                 # Point sprite with glow falloff
    systems/
      ParticleSystem.ts         # Manages star particles across scenes
      ConstellationGenerator.ts # Deterministic block-data → star-positions algorithm
      BlockSync.ts              # Polls BoN API for current block, drives rhythm timing
    utils/
      hash.ts                   # BLS key → position/color deterministic mapping
      export.ts                 # Canvas → PNG export
  lib/
    bon-api.ts                  # BoN API client (block details, network status)
    wallet-pool.ts              # Server-side pre-funded wallet management + nonce tracking
    stats.ts                    # Global stats persistence (file-based or KV)
```

### Backend (API Routes)

**`POST /api/tap`**
- Player taps. Server picks the wallet assigned to this session, assigns nonce, sends a MoveBalance tx to BoN chain.
- Returns: `{ txHash, sentAt }`.
- Rate limiting: max 5 taps/second per session (tracked by session cookie). Sessions are created on round start.

**`POST /api/start-round`**
- Assigns a wallet from the pool to this session. Sets a session cookie.
- Returns: `{ sessionId }`.
- Fails with 503 if all wallets are locked (pool exhausted).

**`POST /api/resolve`**
- Body: `{ txHash, sessionId }` (the final tx hash from the round + session for validation).
- Server verifies the txHash belongs to the session's wallet (prevents players from resolving arbitrary tx hashes). Known MVP limitation: if session validation is bypassed, a player could generate a constellation from any block — acceptable for MVP, the constellation is just art.
- Server polls `GET /transactions/:hash` on the BoN API until confirmed (up to 10s, retry every 1s).
- Returns: `{ blockNonce, blockHash }`.

**`GET /api/block/:nonce`**
- Proxies to BoN API (`https://api.battleofnodes.com/blocks/:nonce`).
- Extracts: proposer, validators, miniblock details (shard, tx count, gas), cross-shard miniblock count.
- Returns: normalized constellation seed data.

**`GET /api/blocks/latest`**
- Returns the latest block timestamp and nonce for the rhythm oscillator. This is the endpoint the client polls every ~500ms — it proxies the BoN API's `/blocks?size=1` and adds a 500ms server-side cache to reduce upstream load.
- The Block Sync Strategy's initialization fetch (10 recent blocks) also goes through this endpoint with a `?size=10` query param.

**`GET /api/stats`**
- Returns: total players, total taps, total constellations generated.
- Stored in Vercel KV (atomic increments, safe under concurrent serverless writes).

**`POST /api/reserve`** (V2)
- Body: `{ walletAddress, constellationBlockNonce }`.
- Associates mainnet wallet with constellation for future mint.
- Stored in persistent DB.

### Transaction Sending

Reuses patterns from the existing stress test infrastructure:
- Pre-funded wallet pool on BoN chain (Chain ID "B").
- Server manages nonce state per wallet.
- MoveBalance transactions: minimal gas (50,000), minimal value (0.001 EGLD or 0 value).
- Uses `@multiversx/sdk-core` for transaction construction and signing.
- Uses `ApiNetworkProvider` pointed at `https://api.battleofnodes.com`.

### Block Sync Strategy

The rhythm game must pulse in time with real block production. HTTP polling introduces variable latency (50-300ms+), so we cannot simply pulse on each poll response. Instead:

**Phase-locked oscillator approach:**
1. On game start, fetch the 10 most recent blocks (`GET /blocks?size=10`) and compute the average block interval (expected: ~600ms, but may vary under stress).
2. Start a client-side oscillator at that interval using `requestAnimationFrame` timing (not `setInterval`, which drifts).
3. Continue polling every ~500ms in the background. When a new block arrives, compute the drift between the oscillator's predicted beat and the actual block timestamp.
4. Apply a soft correction: adjust the oscillator's phase by 10-20% of the drift per cycle. This smooths out jitter while gradually converging to the real block rhythm.
5. If blocks arrive faster or slower than expected (stress test surges, brief pauses), the oscillator adapts within 5-10 cycles.

**Fallback:** If the BoN API becomes unreachable for >5 seconds, the oscillator continues at its last known interval with a subtle visual indicator ("reconnecting..."). The game remains playable — taps still register and are queued for sending when the connection resumes.

**The player never notices jitter.** The oscillator creates a smooth, musical pulse. The real block data gently steers it.

### Transaction-to-Block Resolution

After the round ends, the server resolves which block each transaction landed in:

1. During gameplay, `POST /api/tap` returns `{ txHash, sentAt }` for each tap.
2. The client stores the full list of tx hashes.
3. After the round ends, the client sends `POST /api/resolve` with the final tx hash.
4. The server polls `GET /transactions/:hash` (with retry, up to 10 seconds) until the transaction status shows the containing block nonce.
5. Returns `{ blockNonce, blockHash }` to the client.
6. The client then fetches full block data via `GET /api/block/:nonce` to generate the constellation.

This resolution takes 2-5 seconds, which aligns perfectly with the "starfield calming" transition into the reveal scene.

### Wallet Pool Management

**Pool sizing:** 20 pre-funded wallets. At 5 taps/second max per player and ~30-second rounds, each session uses ~150 nonces from one wallet. 20 wallets support ~20 concurrent players before rotation concerns.

**Session-wallet locking:** When a player starts a round, the server assigns them an exclusive wallet from the pool (simple round-robin with a lock flag). The wallet is released when the round ends. No two active sessions share a wallet.

**Exhaustion behavior:** If all wallets are locked (20+ concurrent players), new players see a "The Supernova is at capacity — try again in a moment" message. The game gate remains visible and retries automatically every 5 seconds.

**Nonce management:** Each wallet tracks its nonce in-memory on the server. On server restart, nonces are re-fetched from the BoN API via `GET /accounts/:address` before the first transaction.

**Refunding:** A separate script (not part of the app) periodically sweeps leftover EGLD back to the operator wallet. Reuses the existing `sweep_stress_wallets.py` pattern.

### Data Sources

- **Real-time block timing:** Poll `GET /blocks?size=1&fields=timestamp,nonce` every ~500ms. Feed into the phase-locked oscillator. See Block Sync Strategy above.
- **Block details for constellations:** `GET /blocks/:nonce` provides proposer, validators, miniblocks, gas, tx count. Required fields: `proposer` (BLS key), `validators` (array), `miniBlocks` (array with shard info), `gasConsumed`, `txCount`, `round`, `nonce`.
- **Transaction resolution:** `GET /transactions/:hash` returns `blockNonce` once the tx is confirmed.
- **Validator info:** `GET /validators` for BLS keys and shard assignments (cached per epoch, ~24 hours).

**API verification note:** These endpoints follow the standard MultiversX API format. Before implementation, verify the exact response shapes against `https://api.battleofnodes.com` — field names and nesting may differ slightly from mainnet API. The BoN API client should be written with explicit field extraction (not pass-through) so mismatches are caught early.

## Performance Budget

| Platform | Star particles | Shaders | Target FPS |
|---|---|---|---|
| Desktop (modern GPU) | 3000-5000 | All (warp, bloom, nebula, star) | 60fps |
| Desktop (integrated GPU) | 1500-2000 | All except nebula volume | 30fps |
| Mobile (iPhone 13+, Pixel 7+) | 500-800 | Star + bloom only, skip warp distortion | 30fps |
| Mobile (older) | 300 | Star sprites only, no post-processing | 24fps |

Detection: check `renderer.capabilities` and `navigator.hardwareConcurrency` on init. Select tier automatically. The gate warp tunnel uses the most GPU — on low-tier devices, simplify to a 2D radial zoom with opacity fade rather than full 3D warp.

**Key constraint:** The constellation reveal must look good on ALL tiers. Particle count for constellations is driven by block data (typically 15-60 validator stars + connection lines), which is always manageable. The performance concern is the ambient starfield and post-processing, not the constellation itself.

## Error Handling

| Scenario | Behavior |
|---|---|
| BoN API unreachable (block polling) | Rhythm oscillator continues at last known interval. HUD shows subtle "reconnecting..." indicator. Taps still register client-side for scoring. Tx sending: if the *server* can't reach the BoN API, `/api/tap` returns 200 with `{ txHash: null, queued: true }` and the server queues the tx internally (in-memory, max 30s / 50 txs). When BoN API resumes, queued txs are sent in order. If the server itself is unreachable from the client, taps are scored locally only (no on-chain tx). |
| Transaction send fails | Silent retry once. If second attempt fails, tap is counted for game scoring but not sent on-chain. HUD tx counter only increments on confirmed sends. No disruption to gameplay. |
| Transaction resolution fails (post-round) | Retry for up to 15 seconds. If still unresolved, fall back to the most recent confirmed block from the round (second-to-last tx). If no txs confirmed at all, generate a constellation from the latest block on the chain (with a note: "Generated from current block — your transactions are still processing"). |
| Wallet pool exhausted | `/api/start-round` returns 503. Client shows "The Supernova is at full capacity — try again shortly" on the gate screen. Auto-retries every 5 seconds. Gate visuals remain active. |
| WebGL not supported | Detect on load. Show a static landing page with the 600ms messaging and a "Best experienced on a modern browser" note. Link to a pre-rendered constellation gallery (static images). |
| Session disconnects mid-round | Round state is client-side only. If the page is refreshed, the round is lost. No server-side session persistence needed for MVP. |

## Dependencies

```json
{
  "three": "^0.172.0",
  "@types/three": "^0.172.0",
  "next": "^15.0.0",
  "react": "^19.0.0",
  "@multiversx/sdk-core": "^15.4.0",
  "axios": "^1.7.0",
  "bignumber.js": "^9.0.0",
  "protobufjs": "^7.2.6"
}
```

Three.js is used directly (not React Three Fiber) — we need precise control over render loops, shader passes, and scene transitions that R3F's declarative model makes harder. React handles only the HUD and UI overlays positioned absolutely over the canvas.

## MVP Scope

### In (ship in 2-3 days):
- The Gate: 3D warp tunnel entry (3-5 second immersive transition)
- The Rhythm: tap-to-sync game with real tx sending (~30 second round)
- Constellation generation from real block data
- Animated constellation reveal (5-8 second draw sequence)
- Save as high-resolution PNG
- Shareable constellation URL (deterministic re-rendering)
- Global stats counter (players, txs, constellations)
- Mobile responsive (portrait mode, touch taps)

### Out (V2):
- Wallet connect + mint reservation system
- Full constellation gallery browser
- Leaderboard (ranked by accuracy)
- Sound design / Web Audio API (ambient space audio, tap sounds)
- Additional game modes (reaction race, 600ms comparison wall)
- NFT smart contract for mainnet mint
- Detailed tx lifecycle inspector (dev layer)

## Build Decomposition (Parallel Subagent Architecture)

The project decomposes into four independent build tracks that can be developed in parallel by subagents, with a final integration pass:

### Track 1: Three.js Immersive Layer
- GateScene (starfield, warp tunnel, camera animation)
- RhythmScene (pulsing stars, tap orb, particle bursts, accuracy feedback)
- RevealScene (constellation drawing animation, nebula glow)
- Shared: ParticleSystem, shaders (warp, bloom, nebula, star)
- Scene transition system (gate → rhythm → reveal → save)
- Canvas export to PNG

### Track 2: Constellation Generator
- Deterministic algorithm: block data → star positions, colors, connections
- BLS key hashing → 2D position mapping
- Shard-based color assignment
- Cross-shard edge computation
- Nebula glow from gas data
- Block-nonce-seeded jitter
- Unit tests for determinism (same input = same output)

### Track 3: Backend / API Layer
- Next.js API routes (tap, block, stats)
- BoN API client (block polling, block details, validator info)
- Pre-funded wallet pool management
- Transaction construction and sending via sdk-core
- Nonce management
- Rate limiting
- Stats persistence

### Track 4: App Shell / UI
- Next.js app structure and routing
- Experience.tsx (Three.js canvas mount, scene orchestrator)
- HUD overlay (accuracy, tx count, block number)
- SavePanel (download PNG, share link, wallet connect placeholder)
- Constellation share page (`/constellation/[nonce]`)
- Mobile responsive layout
- Loading states and error handling

### Integration
- Wire API responses into Three.js scenes (block timing → rhythm, block data → constellation)
- End-to-end flow: gate → rhythm with real txs → reveal with real block data → save
- Deploy to Vercel

## Verification Plan

1. **Gate scene:** Opens in browser. Stars render. Click triggers warp animation. Camera transitions to game space.
2. **Rhythm game:** Stars pulse at ~600ms intervals. Taps register. HUD updates. On-beat vs off-beat visual difference is clear.
3. **Transaction sending:** Each tap sends a real tx to BoN. Verify tx hashes on `explorer.battleofnodes.com`.
4. **Constellation:** After round ends, constellation renders from real block data. Same block nonce always produces identical constellation.
5. **Save:** PNG downloads with correct resolution. Share link loads and re-renders the same constellation.
6. **Mobile:** Touch taps work. Layout is usable in portrait mode. Performance is acceptable on a recent phone.
7. **Stats:** Global counters increment correctly across sessions.
