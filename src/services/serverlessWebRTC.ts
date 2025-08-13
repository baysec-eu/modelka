// src/services/serverlessWebRTC.ts — CQRS-aware P2P transport over Trystero/BitTorrent
/* eslint-disable @typescript-eslint/no-explicit-any */

import type { DiagramEvent } from '../state/DiagramContext';
import { joinRoom as joinTorrentRoom } from 'trystero/torrent';

// Global connection manager to prevent socket exhaustion
class WebRTCConnectionManager {
  private static instance: WebRTCConnectionManager | null = null;
  private activeConnections = new Set<ServerlessWebRTC>();
  private readonly maxConnections = 1; // Only allow 1 connection to prevent socket exhaustion

  static getInstance(): WebRTCConnectionManager {
    if (!this.instance) {
      this.instance = new WebRTCConnectionManager();
    }
    return this.instance;
  }

  register(connection: ServerlessWebRTC): boolean {
    // Force cleanup of existing connections to prevent socket storms
    if (this.activeConnections.size >= this.maxConnections) {
      console.log('🧹 Cleaning up existing connections to prevent socket exhaustion...');
      this.cleanup();
    }
    
    this.activeConnections.add(connection);
    console.log(`📊 Active WebRTC connections: ${this.activeConnections.size}/${this.maxConnections}`);
    return true;
  }

  unregister(connection: ServerlessWebRTC): void {
    this.activeConnections.delete(connection);
    console.log(`📊 Active WebRTC connections: ${this.activeConnections.size}/${this.maxConnections}`);
  }

  cleanup(): void {
    console.log('🧹 Forcing cleanup of all WebRTC connections...');
    for (const connection of this.activeConnections) {
      try {
        connection.disconnect();
      } catch (error) {
        console.warn('⚠️ Error during connection cleanup:', error);
      }
    }
    this.activeConnections.clear();
  }
}

/* -------------------------------------------------------------------------- */
/* ICE helpers (STUN only; no TURN)                                           */
/* -------------------------------------------------------------------------- */
// Minimal tracker list to prevent socket exhaustion (NSURLErrorDomain error 28)
const WORKING_TRACKERS_2025 = [
  // Use only ONE reliable tracker to prevent socket storms
  'wss://tracker.openwebtorrent.com',
];

function fallbackStun(): RTCIceServer[] {
  return [
    // Tier 1: Google STUN servers (fastest and most reliable)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    
    // Tier 2: Alternative reliable STUN servers
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:stun.stunprotocol.org' },
    
    // Tier 3: Fast TURN servers for difficult NAT scenarios
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Optional end-to-end AES-GCM encryption (application-level)                 */
/* -------------------------------------------------------------------------- */
const SALT = new TextEncoder().encode('ModelkaSalt');

async function derive(pass: string) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pass),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function enc(obj: unknown, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(JSON.stringify(obj));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  const blob = new Uint8Array(iv.byteLength + ct.byteLength);
  blob.set(iv, 0);
  blob.set(new Uint8Array(ct), iv.byteLength);
  return btoa(String.fromCharCode(...blob));
}

async function dec<T>(b64: string, key: CryptoKey): Promise<T> {
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(pt));
}

/* -------------------------------------------------------------------------- */
/* Message shapes                                                             */
/* -------------------------------------------------------------------------- */
export interface DiagramMessage {
  type:
    | 'events'
    | 'request_history'
    | 'user_presence'
    | 'user_disconnect'
    | 'full_history'
    | 'raft_message'
    | 'distributed_operation'
    | 'conflict_resolution'
    | 'network_partition'
    | 'consensus_message'
    | 'diagram_update';
  data: unknown;
  userId: string;
  timestamp: number;
}

type SystemKind = 'hello' | 'ping' | 'pong' | 'app';

interface WireEnvelope {
  v: 1;
  id: string; // message id
  kind: SystemKind;
  ts: number;
  to?: string;
  // For kind === 'app'
  appType?: DiagramMessage['type'];
  payload?: string; // base64 AES-GCM ciphertext or JSON string (if no key)
  // For kind === 'hello'/'ping'/'pong'
  meta?: any;
}

/* -------------------------------------------------------------------------- */
/* Metrics & peer state                                                       */
/* -------------------------------------------------------------------------- */
export interface ConnectionMetrics {
  latency: number;          // ms (EMA)
  packetLoss: number;       // 0..1 (from pings over last window)
  bandwidth: number;        // kB/s (EMA of bytes/s both directions)
  reliability: 'excellent' | 'good' | 'poor' | 'unstable';
  lastUpdate: number;
}

export interface PeerInfo {
  nodeId: string;   // transport-level peer id
  userId: string;   // app logical user id
  connectionQuality: ConnectionMetrics;
  capabilities: string[];
  joinedAt: number;
  lastSeen: number;
}

type Handler = (payload: any, fromUserId: string) => void;

function now() { return Date.now(); }
function uuid() { return crypto.randomUUID(); }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

/* -------------------------------------------------------------------------- */
/* Rolling meters                                                             */
/* -------------------------------------------------------------------------- */
class Ema {
  private value = 0;
  private initialized = false;
  constructor(private alpha = 0.25) {}
  push(x: number) {
    if (!this.initialized) { this.value = x; this.initialized = true; }
    else this.value = this.value + this.alpha * (x - this.value);
  }
  read() { return this.value; }
}

class RollingCounter {
  private buckets: { t: number; inB: number; outB: number; pings: number; pongs: number }[] = [];
  constructor(private windowMs = 30_000) {}
  private prune(t: number) {
    const from = t - this.windowMs;
    this.buckets = this.buckets.filter(b => b.t >= from);
  }
  private bucketFor(t: number) {
    const sec = Math.floor(t / 1000);
    let b = this.buckets.find(x => Math.floor(x.t / 1000) === sec);
    if (!b) { b = { t, inB: 0, outB: 0, pings: 0, pongs: 0 }; this.buckets.push(b); }
    return b;
  }
  addBytes(direction: 'in' | 'out', n: number) {
    const b = this.bucketFor(now());
    if (direction === 'in') b.inB += n; else b.outB += n;
    this.prune(now());
  }
  addPing() { this.bucketFor(now()).pings++; this.prune(now()); }
  addPong() { this.bucketFor(now()).pongs++; this.prune(now()); }
  rates() {
    this.prune(now());
    const span = this.windowMs / 1000;
    const sums = this.buckets.reduce((a, b) => ({
      inB: a.inB + b.inB, outB: a.outB + b.outB, pings: a.pings + b.pings, pongs: a.pongs + b.pongs
    }), { inB: 0, outB: 0, pings: 0, pongs: 0 });
    const bytesPerSec = (sums.inB + sums.outB) / span;
    const loss = sums.pings ? clamp((sums.pings - sums.pongs) / sums.pings, 0, 1) : 0;
    return { bytesPerSec, loss };
  }
}

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */
export interface ServerlessWebRTCOptions {
  trackers?: string[];
  iceServers?: RTCIceServer[];
  appId?: string;
  autoRequestHistory?: boolean; // request history when first peer joins
  heartbeatMs?: number;         // ping interval
  sendThrottleBytes?: number;   // max bytes per flush
  maxQueueSize?: number;        // backpressure guard
}

/* -------------------------------------------------------------------------- */
/* Transport                                                                  */
/* -------------------------------------------------------------------------- */
export class ServerlessWebRTC {
  private room!: ReturnType<typeof joinTorrentRoom>;
  private key: CryptoKey | null = null;

  private handlers = new Map<DiagramMessage['type'], Handler>();

  private peers = new Map<string, PeerInfo>();           // by peerId
  private userIdByPeer = new Map<string, string>();      // peerId -> userId

  private myUserId!: string;
  private myNodeId!: string;

  private connectedAt = now();

  private latencyEma = new Map<string, Ema>();           // peerId -> EMA
  private bwEma = new Map<string, Ema>();                // peerId -> EMA
  private rolling = new RollingCounter(30_000);

  private heartbeatInterval?: number;
  private flushInterval?: number;

  private messageSent = 0;
  private messageRecv = 0;
  private networkErrors = 0;

  private sendQueue: Uint8Array[] = [];
  private readonly options: Required<ServerlessWebRTCOptions>;

  // Trystero actions
  private sendApp!: (data: any, peerId?: string) => void;
  private onApp!: (cb: (data: any, peerId: string) => void) => void;
  private sendSys!: (data: any, peerId?: string) => void;
  private onSys!: (cb: (data: any, peerId: string) => void) => void;

  private constructor(opts?: ServerlessWebRTCOptions) {
    const defaults: Required<ServerlessWebRTCOptions> = {
      trackers: WORKING_TRACKERS_2025,
      iceServers: fallbackStun(),
      appId: 'modelka-diagram',
      autoRequestHistory: true,
      heartbeatMs: 1_500, // 1.5s for faster peer detection and <5s connection
      sendThrottleBytes: 512 * 1024, // Increased to 512kB for better throughput
      maxQueueSize: 16 * 1024 * 1024, // Increased to 16MB for larger diagrams
    };
    this.options = { ...defaults, ...(opts || {}) };
  }

  /* --------------------------- bootstrap --------------------------------- */
  static async connect(
    roomId: string,
    userId: string,
    pass?: string,
    opts?: ServerlessWebRTCOptions,
  ): Promise<ServerlessWebRTC> {
    // Get connection manager and ensure we don't exceed limits
    const manager = WebRTCConnectionManager.getInstance();
    
    const self = new ServerlessWebRTC(opts);
    self.myUserId = userId;
    self.myNodeId = crypto.randomUUID(); // transport-level ID (local)

    // Register connection with manager (this will cleanup old ones if needed)
    manager.register(self);

    if (pass) self.key = await derive(pass);

    const { trackers, iceServers } = self.options;

    // CRITICAL FIX: Use roomId as appId to ensure proper room isolation
    const actualAppId = `modelka-${roomId}`;
    console.log('🌍 Connecting to BitTorrent room:', actualAppId, 'with', trackers.length, 'trackers');
    
    self.room = joinTorrentRoom(
      {
        appId: actualAppId, // Use roomId for proper isolation
        password: pass ?? undefined, // Trystero uses this to encrypt SDP during discovery
        relayUrls: trackers,
        rtcConfig: { 
          iceServers,
          // Optimized ICE configuration for fast P2P connections (2025)
          iceCandidatePoolSize: 16, // Reduced from 32 for faster gathering
          iceTransportPolicy: 'all', // Allow all transport methods (UDP/TCP)
          bundlePolicy: 'max-bundle', // Bundle all media on single transport for efficiency
          rtcpMuxPolicy: 'require', // Multiplex RTP/RTCP to reduce ports needed
          
          // Aggressive settings for <5 second connections
          // iceGatheringTimeout: 8000, // Not standard RTCConfiguration property
          // iceConnectionTimeout: 12000, // Reduced from 20s to 12s - not standard RTCConfiguration
          // iceInactivityTimeout: 20000, // Reduced from 30s to 20s - not standard RTCConfiguration
          
          // Additional optimizations for speed
          // iceCandidateTimeout: 5000, // 5s timeout for each candidate - not standard RTCConfiguration
          // continualGatheringPolicy: 'gather_continually', // Keep gathering - not standard RTCConfiguration
        },
      },
      roomId,
    );

    console.log('🎯 Room joined, setting up peer discovery...');

    // Trystero actions (system + app)
    {
      const [sendSys, onSys] = self.room.makeAction('sys');
      const [sendApp, onApp] = self.room.makeAction('app');
      self.sendSys = sendSys;
      self.onSys = onSys;
      self.sendApp = sendApp;
      self.onApp = onApp;
    }

    // Peer lifecycle
    self.room.onPeerJoin((peerId: string) => self.onPeerJoin(peerId));
    self.room.onPeerLeave((peerId: string) => self.onPeerLeave(peerId));

    // System channel
    self.onSys(async (data: any, peerId: string) => {
      try {
        self.rolling.addBytes('in', roughSize(data));
        const env: WireEnvelope = data;
        if (!env || env.v !== 1 || !env.kind) return;

        if (env.kind === 'hello') {
          const info = env.meta as PeerInfo;
          self.userIdByPeer.set(peerId, info.userId);

          const metrics = self.composeMetrics(peerId);
          self.peers.set(peerId, {
            nodeId: peerId,
            userId: info.userId,
            connectionQuality: metrics,
            capabilities: info.capabilities || [],
            joinedAt: info.joinedAt || now(),
            lastSeen: now(),
          });
          self.emit('user_presence', { id: info.userId, ts: env.ts }, info.userId);

          if (self.options.autoRequestHistory && self.peers.size === 1) {
            self.send('request_history', { since: 0 });
          }
          return;
        }

        if (env.kind === 'ping') {
          const sent = env.meta?.t as number;
          const nonce = env.meta?.n as string;
          const reply: WireEnvelope = { v: 1, id: uuid(), kind: 'pong', ts: now(), meta: { t: sent, n: nonce } };
          self.rolling.addPong();
          self.safeSendSys(reply, peerId);
          return;
        }

        if (env.kind === 'pong') {
          const sent = env.meta?.t as number;
          const rtt = now() - sent;
          self.rolling.addPong();
          self.latencyEma.get(peerId)?.push(rtt);
          self.touchPeer(peerId);
          return;
        }
      } catch {
        self.networkErrors++;
      }
    });

    // App channel (encrypted payloads)
    self.onApp(async (data: any, peerId: string) => {
      try {
        self.rolling.addBytes('in', roughSize(data));
        const env: WireEnvelope = data;
        if (!env || env.v !== 1 || env.kind !== 'app') return;

        const fromUserId = self.userIdByPeer.get(peerId) ?? peerId;
        let msg: DiagramMessage;

        if (self.key) {
          try {
            msg = await dec<DiagramMessage>(env.payload!, self.key);
          } catch {
            self.networkErrors++; // mismatched passphrase, etc.
            return;
          }
        } else {
          msg = JSON.parse(env.payload as string);
        }

        self.messageRecv++;
        self.touchPeer(peerId);

        self.emit(msg.type, msg.data, fromUserId);
      } catch {
        self.networkErrors++;
      }
    });

    // Start periodic tasks
    self.startHeartbeats();
    self.startFlush();

    // Announce our presence (broadcast)
    self.announcePresence();

    // Re-announce on network changes
    const rebound = () => self.rejoin();
    window.addEventListener('online', rebound);
    window.addEventListener('offline', rebound);

    return self;
  }

  /* --------------------------- awareness & lifecycle --------------------- */
  private onPeerJoin(peerId: string) {
    if (!this.latencyEma.has(peerId)) this.latencyEma.set(peerId, new Ema(0.25));
    if (!this.bwEma.has(peerId)) this.bwEma.set(peerId, new Ema(0.25));

    const hello: WireEnvelope = {
      v: 1,
      id: uuid(),
      kind: 'hello',
      ts: now(),
      meta: {
        nodeId: this.myNodeId,
        userId: this.myUserId,
        capabilities: ['events', 'history', 'presence'],
        joinedAt: this.connectedAt,
        lastSeen: now(),
      } as PeerInfo,
    };
    this.safeSendSys(hello, peerId);
    this.sendPing(peerId);
  }

  private onPeerLeave(peerId: string) {
    const userId = this.userIdByPeer.get(peerId);
    this.userIdByPeer.delete(peerId);
    this.peers.delete(peerId);
    this.latencyEma.delete(peerId);
    this.bwEma.delete(peerId);
    if (userId) {
      this.emit('user_disconnect', { userId }, userId);
    }
  }

  private announcePresence() {
    const hello: WireEnvelope = {
      v: 1,
      id: uuid(),
      kind: 'hello',
      ts: now(),
      meta: {
        nodeId: this.myNodeId,
        userId: this.myUserId,
        capabilities: ['events', 'history', 'presence'],
        joinedAt: this.connectedAt,
        lastSeen: now(),
      } as PeerInfo,
    };
    this.safeSendSys(hello);
  }

  private touchPeer(peerId: string) {
    const info = this.peers.get(peerId);
    if (info) {
      info.lastSeen = now();
      info.connectionQuality = this.composeMetrics(peerId);
      this.peers.set(peerId, info);
    }
  }

  /* --------------------------- heartbeats & metrics ---------------------- */
  private startHeartbeats() {
    const jitter = () => Math.floor(Math.random() * 2500);
    const sendAll = () => {
      const ids = this.peerIds();
      for (const pid of ids) this.sendPing(pid);
      // Update bandwidth EMA (same value pushed to each peer - aggregate channel view)
      const { bytesPerSec } = this.rolling.rates();
      for (const pid of ids) {
        this.bwEma.get(pid)?.push(bytesPerSec / 1024);
        this.touchPeer(pid);
      }
    };
    const run = () => {
      sendAll();
      this.heartbeatInterval = window.setTimeout(run, this.options.heartbeatMs + jitter());
    };
    run();
  }

  private sendPing(peerId: string) {
    const nonce = uuid();
    const env: WireEnvelope = { v: 1, id: uuid(), kind: 'ping', ts: now(), meta: { t: now(), n: nonce } };
    this.rolling.addPing();
    this.safeSendSys(env, peerId);
  }

  private composeMetrics(peerId: string): ConnectionMetrics {
    const { loss } = this.rolling.rates();
    const latency = this.latencyEma.get(peerId)?.read() || 0;
    const bandwidth = this.bwEma.get(peerId)?.read() || 0; // kB/s
    const reliability: ConnectionMetrics['reliability'] =
      latency < 80 && loss < 0.02 ? 'excellent'
      : latency < 150 && loss < 0.05 ? 'good'
      : latency < 350 && loss < 0.15 ? 'poor'
      : 'unstable';
    return { latency, packetLoss: loss, bandwidth, reliability, lastUpdate: now() };
  }

  /* --------------------------- backpressure & flush ---------------------- */
  private startFlush() {
    const flush = () => {
      let budget = this.options.sendThrottleBytes;
      while (this.sendQueue.length && budget > 0) {
        const next = this.sendQueue.shift()!;
        budget -= next.byteLength;
        try {
          const bag = JSON.parse(new TextDecoder().decode(next));
          if (bag.ch === 'app') this.sendApp(bag.data, bag.peer);
          else this.sendSys(bag.data, bag.peer);
          this.rolling.addBytes('out', next.byteLength);
        } catch {
          this.networkErrors++;
        }
      }
      this.flushInterval = window.setTimeout(flush, 25);
    };
    flush();
  }

  private enqueue(channel: 'app' | 'sys', data: any, peerId?: string) {
    const asJson = JSON.stringify({ ch: channel, data, peer: peerId });
    const payload = new TextEncoder().encode(asJson);
    const projected = this.sendQueue.reduce((n, b) => n + b.byteLength, 0) + payload.byteLength;
    if (projected > this.options.maxQueueSize) {
      // Drop oldest until under half the cap to avoid oscillation
      let used = this.sendQueue.reduce((n, b) => n + b.byteLength, 0);
      while (this.sendQueue.length && used > this.options.maxQueueSize / 2) {
        const removed = this.sendQueue.shift()!;
        used -= removed.byteLength;
      }
    }
    this.sendQueue.push(payload);
  }

  private safeSendSys(env: WireEnvelope, peerId?: string) {
    this.enqueue('sys', env, peerId);
  }

  private safeSendApp(env: WireEnvelope, peerId?: string) {
    this.enqueue('app', env, peerId);
  }

  /* --------------------------- public API -------------------------------- */
  on<T = unknown>(type: DiagramMessage['type'], handler: (payload: T, from: string) => void) {
    this.handlers.set(type, handler as Handler);
  }

  async send(type: DiagramMessage['type'], data: unknown, peerId?: string) {
    const msg: DiagramMessage = {
      type,
      data,
      timestamp: now(),
      userId: this.myUserId,
    };
    let payload: string;
    if (this.key) payload = await enc(msg, this.key);
    else payload = JSON.stringify(msg);
    const env: WireEnvelope = { v: 1, id: uuid(), kind: 'app', ts: now(), appType: type, payload };
    this.messageSent++;
    this.safeSendApp(env, peerId);
  }

  async sendEvents(events: DiagramEvent[]) {
    await this.send('events', events);
  }

  async sendFullHistory(events: DiagramEvent[]) {
    await this.send('full_history', events);
  }

  /**
   * Explicitly request history from peers (if autoRequestHistory=false).
   */
  async requestHistory(hint: any = { since: 0 }) {
    await this.send('request_history', hint);
  }

  /**
   * Is there at least 1 connected peer?
   */
  isConnected(): boolean {
    return this.peerIds().length > 0;
  }

  /**
   * Is the room initialized and ready for peer discovery?
   */
  isRoomReady(): boolean {
    return this.room !== null;
  }

  /**
   * Are we currently discovering peers?
   */
  isDiscoveringPeers(): boolean {
    return this.room !== null && this.peerIds().length === 0;
  }

  /**
   * Enhanced connection state for better UX
   */
  getConnectionState(): 'not-initialized' | 'discovering' | 'connected' | 'failed' {
    if (!this.room) return 'not-initialized';
    
    // Check for connection failures
    if (this.networkErrors > 5) {
      console.warn('⚠️ Multiple network errors detected, connection may be failed');
      return 'failed';
    }
    
    const peerCount = this.peerIds().length;
    const authenticatedPeerCount = this.peers.size;
    
    // If we have RTC peers but no authenticated peers, we're still discovering
    if (peerCount > 0 && authenticatedPeerCount === 0) {
      console.log(`🔍 Have ${peerCount} RTC peers but 0 authenticated, still discovering...`);
      return 'discovering';
    }
    
    // If we have authenticated peers, we're connected
    if (authenticatedPeerCount > 0) {
      console.log(`✅ Connected with ${authenticatedPeerCount} authenticated peers`);
      return 'connected';
    }
    
    // No peers yet, still discovering
    return 'discovering';
  }

  /**
   * Read-only snapshot of current peers.
   */
  getPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  /**
   * Transport statistics (rolling).
   */
  getStats() {
    const { bytesPerSec, loss } = this.rolling.rates();
    const rtcConnectedPeers = this.peerIds().length; // Raw RTC peer count
    const authenticatedPeers = this.peers.size; // Peers that completed handshake

    // Average latency over authenticated peers if any
    const latSum = Array.from(this.latencyEma.values()).reduce((a, e) => a + e.read(), 0);
    const avgLatency = authenticatedPeers ? Math.round(latSum / authenticatedPeers) : 0;

    const reliability: ConnectionMetrics['reliability'] =
      authenticatedPeers === 0 ? 'unstable'
      : loss < 0.02 && avgLatency < 80 ? 'excellent'
      : loss < 0.05 && avgLatency < 150 ? 'good'
      : loss < 0.15 && avgLatency < 350 ? 'poor'
      : 'unstable';

    return {
      connectedPeers: authenticatedPeers, // Use authenticated peer count for accurate stats
      rtcPeers: rtcConnectedPeers, // Raw RTC connections for debugging
      messagesSent: this.messageSent,
      messagesReceived: this.messageRecv,
      networkErrors: this.networkErrors,
      bandwidthKBps: Math.round(bytesPerSec / 1024),
      connectionQuality: {
        latency: avgLatency,
        reliability,
      },
    };
  }

  /**
   * Leave room and clean up timers/listeners.
   */
  disconnect() {
    console.log('🔌 Disconnecting WebRTC connection...');
    
    // Unregister from connection manager
    const manager = WebRTCConnectionManager.getInstance();
    manager.unregister(this);
    
    try { this.room.leave(); } catch {}
    if (this.heartbeatInterval) clearTimeout(this.heartbeatInterval);
    if (this.flushInterval) clearTimeout(this.flushInterval);
    window.removeEventListener('online', this.rejoin);
    window.removeEventListener('offline', this.rejoin);
    this.handlers.clear();
    this.peers.clear();
    this.userIdByPeer.clear();
    this.latencyEma.clear();
    this.bwEma.clear();
    
    console.log('✅ WebRTC connection disconnected and cleaned up');
  }

  /* --------------------------- helpers ----------------------------------- */
  private emit(type: DiagramMessage['type'], data: any, from = '') {
    this.handlers.get(type as DiagramMessage['type'])?.(data, from);
  }

  private rejoin = () => {
    this.announcePresence();
  };

  /**
   * Normalize Trystero's getPeers() across versions to always return string[].
   * Some versions return string[], others Map/Set-like, others an object map.
   */
  private peerIds(): string[] {
    try {
      const peers = (this.room as any)?.getPeers?.();
      if (!peers) return [];
      if (Array.isArray(peers)) return peers as string[];
      // Set/Map/iterable?
      try {
        // If iterable, spread it
        return Array.from(peers as Iterable<string>);
      } catch {
        // Object map fallback
        if (typeof peers === 'object') return Object.keys(peers as Record<string, unknown>);
        return [];
      }
    } catch {
      return [];
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Utilities                                                                  */
/* -------------------------------------------------------------------------- */
function roughSize(obj: any): number {
  try {
    if (typeof obj === 'string') return obj.length;
    if (obj instanceof ArrayBuffer) return obj.byteLength;
    if (ArrayBuffer.isView(obj)) return (obj as ArrayBufferView).byteLength;
    return JSON.stringify(obj).length;
  } catch {
    return 0;
  }
}
