import { inflateSync } from "node:zlib";
import { createHash } from "node:crypto";

import { Subscriber } from "zeromq";

const DEFAULT_EDDN_RELAY_URL = "tcp://eddn.edcd.io:9500";
const COMMODITY_SCHEMA_MARKER = "/commodity/";

export interface EddnListener {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface EddnListenerOptions {
  readonly relayUrl?: string;
  readonly logger?: Pick<Console, "error" | "log" | "warn">;
  onMarketSnapshot?(snapshot: MarketSnapshot): Promise<void> | void;
  onBgsObservation?(observation: BgsSystemObservation): Promise<void> | void;
}

interface EddnEnvelope {
  readonly $schemaRef?: unknown;
  readonly header?: unknown;
  readonly message?: unknown;
}

interface EddnCommodityMessage {
  readonly commodities?: unknown;
  readonly marketId?: unknown;
  readonly stationName?: unknown;
  readonly systemName?: unknown;
  readonly timestamp?: unknown;
}

interface EddnJournalMessage {
  readonly ActiveStates?: unknown;
  readonly Factions?: unknown;
  readonly SystemFaction?: unknown;
  readonly StarSystem?: unknown;
  readonly event?: unknown;
  readonly timestamp?: unknown;
}

interface EddnCommodity {
  readonly buyPrice?: unknown;
  readonly demand?: unknown;
  readonly demandBracket?: unknown;
  readonly meanPrice?: unknown;
  readonly name?: unknown;
  readonly sellPrice?: unknown;
  readonly stock?: unknown;
  readonly stockBracket?: unknown;
}

export interface MarketCommoditySnapshot {
  readonly buyPrice: number | undefined;
  readonly demand: number | undefined;
  readonly demandLevel: number | undefined;
  readonly meanPrice: number | undefined;
  readonly name: string;
  readonly sellPrice: number | undefined;
  readonly stock: number | undefined;
  readonly stockLevel: number | undefined;
}

export interface MarketSnapshot {
  readonly collectedAt: string | undefined;
  readonly commodities: readonly MarketCommoditySnapshot[];
  readonly marketId: number | undefined;
  readonly stationName: string | undefined;
  readonly systemName: string | undefined;
  readonly schemaRef: string;
  readonly eventHash: string;
}

export interface BgsFactionObservation {
  readonly activeStates: readonly string[];
  readonly factionState: string | undefined;
  readonly happiness: string | undefined;
  readonly influence: number | undefined;
  readonly name: string;
  readonly pendingStates: readonly string[];
  readonly recoveringStates: readonly string[];
}

export interface BgsSystemObservation {
  readonly event: string;
  readonly eventHash: string;
  readonly factions: readonly BgsFactionObservation[];
  readonly observedAt: string;
  readonly schemaRef: string;
  readonly systemFactionName: string | undefined;
  readonly systemName: string;
}

export function createEddnListener(
  options: EddnListenerOptions = {},
): EddnListener {
  const relayUrl = options.relayUrl ?? DEFAULT_EDDN_RELAY_URL;
  const logger = options.logger ?? console;
  let socket: Subscriber | undefined;
  let isRunning = false;
  let loopPromise: Promise<void> | undefined;

  return {
    async start(): Promise<void> {
      if (loopPromise) {
        return loopPromise;
      }

      socket = new Subscriber();
      socket.connect(relayUrl);
      socket.subscribe();
      isRunning = true;
      logger.log(`Listening for EDDN commodity market data at ${relayUrl}`);

      loopPromise = runListenerLoop(
        socket,
        logger,
        options.onMarketSnapshot,
        options.onBgsObservation,
      ).finally(() => {
        isRunning = false;
        socket = undefined;
        loopPromise = undefined;
      });

      return loopPromise;
    },
    async stop(): Promise<void> {
      if (!isRunning) {
        return;
      }

      isRunning = false;
      socket?.close();

      try {
        await loopPromise;
      } catch (error: unknown) {
        if (!isExpectedCloseError(error)) {
          throw error;
        }
      }
    },
  };
}

async function runListenerLoop(
  socket: Subscriber,
  logger: Pick<Console, "error" | "log" | "warn">,
  onMarketSnapshot?: (snapshot: MarketSnapshot) => Promise<void> | void,
  onBgsObservation?: (observation: BgsSystemObservation) => Promise<void> | void,
): Promise<void> {
  try {
    for await (const [payload] of socket) {
      if (!payload) {
        continue;
      }

      const envelope = parseEddnEnvelope(payload);
      const snapshot = parseMarketSnapshotEnvelope(envelope);

      if (snapshot && onMarketSnapshot) {
        await onMarketSnapshot(snapshot);
      }

      const bgsObservation = parseBgsSystemObservation(envelope);

      if (bgsObservation && onBgsObservation) {
        await onBgsObservation(bgsObservation);
      }

      if (snapshot && !onMarketSnapshot) {
        logMarketSnapshot(snapshot, logger);
      }
    }
  } catch (error: unknown) {
    if (!isExpectedCloseError(error)) {
      throw error;
    }
  }
}

export function parseMarketSnapshot(
  compressedPayload: Buffer,
): MarketSnapshot | undefined {
  return parseMarketSnapshotEnvelope(parseEddnEnvelope(compressedPayload));
}

function parseMarketSnapshotEnvelope(parsed: unknown): MarketSnapshot | undefined {

  if (!isEddnEnvelope(parsed) || !isCommoditySchema(parsed.$schemaRef)) {
    return undefined;
  }

  const message = parsed.message;

  if (!isCommodityMessage(message) || !Array.isArray(message.commodities)) {
    return undefined;
  }

  const commodities = message.commodities
    .map(readCommoditySnapshot)
    .filter((commodity): commodity is MarketCommoditySnapshot => Boolean(commodity));

  if (commodities.length === 0) {
    return undefined;
  }

  const snapshot = {
    collectedAt: readString(message.timestamp),
    commodities,
    marketId: readNumber(message.marketId),
    stationName: readString(message.stationName),
    systemName: readString(message.systemName),
    schemaRef: readString(parsed.$schemaRef) ?? "unknown",
  };

  return {
    ...snapshot,
    eventHash: hashNormalizedEvent(snapshot),
  };
}

function parseBgsSystemObservation(parsed: unknown): BgsSystemObservation | undefined {
  if (!isEddnEnvelope(parsed) || !isJournalSchema(parsed.$schemaRef)) {
    return undefined;
  }

  const message = parsed.message as EddnJournalMessage | undefined;
  const event = readString(message?.event);
  const observedAt = readString(message?.timestamp);
  const systemName = readString(message?.StarSystem);
  const rawFactions = message?.Factions;

  if (
    !message ||
    !event ||
    !["Location", "FSDJump", "CarrierJump"].includes(event) ||
    !observedAt ||
    !systemName ||
    !Array.isArray(rawFactions)
  ) {
    return undefined;
  }

  const factions = rawFactions
    .map(readBgsFactionObservation)
    .filter((faction): faction is BgsFactionObservation => faction !== undefined);

  if (factions.length === 0) {
    return undefined;
  }

  const systemFaction = isPlainObject(message.SystemFaction)
    ? readString(message.SystemFaction.Name)
    : undefined;
  const normalized = {
    event,
    factions,
    observedAt,
    schemaRef: readString(parsed.$schemaRef) ?? "unknown",
    systemFactionName: systemFaction,
    systemName,
  };

  return { ...normalized, eventHash: hashNormalizedEvent(normalized) };
}

function readBgsFactionObservation(value: unknown): BgsFactionObservation | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }

  const name = readString(value.Name);
  if (!name) {
    return undefined;
  }

  return {
    activeStates: readStateNames(value.ActiveStates),
    factionState: readString(value.FactionState),
    happiness: readString(value.Happiness),
    influence: readNumber(value.Influence),
    name,
    pendingStates: readStateNames(value.PendingStates),
    recoveringStates: readStateNames(value.RecoveringStates),
  };
}

function readStateNames(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isPlainObject(entry)) {
      return [];
    }

    const state = readString(entry.State);
    return state ? [state] : [];
  });
}

function parseEddnEnvelope(compressedPayload: Buffer): unknown {
  return JSON.parse(inflateSync(compressedPayload).toString("utf8"));
}

function hashNormalizedEvent(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function readCommoditySnapshot(
  commodity: unknown,
): MarketCommoditySnapshot | undefined {
  if (!isPlainObject(commodity)) {
    return undefined;
  }

  const eddnCommodity = commodity as EddnCommodity;
  const name = readString(eddnCommodity.name);

  if (!name) {
    return undefined;
  }

  return {
    buyPrice: readNumber(eddnCommodity.buyPrice),
    demand: readNumber(eddnCommodity.demand),
    demandLevel: readNumber(eddnCommodity.demandBracket),
    meanPrice: readNumber(eddnCommodity.meanPrice),
    name,
    sellPrice: readNumber(eddnCommodity.sellPrice),
    stock: readNumber(eddnCommodity.stock),
    stockLevel: readNumber(eddnCommodity.stockBracket),
  };
}

function logMarketSnapshot(
  snapshot: MarketSnapshot,
  logger: Pick<Console, "log">,
): void {
  logger.log(
    JSON.stringify(
      {
        collectedAt: snapshot.collectedAt,
        commodityCount: snapshot.commodities.length,
        commodities: snapshot.commodities,
        marketId: snapshot.marketId,
        schemaRef: snapshot.schemaRef,
        stationName: snapshot.stationName,
        systemName: snapshot.systemName,
      },
      undefined,
      2,
    ),
  );
}

function isEddnEnvelope(value: unknown): value is EddnEnvelope {
  return isPlainObject(value);
}

function isCommoditySchema(schemaRef: unknown): boolean {
  return typeof schemaRef === "string" && schemaRef.includes(COMMODITY_SCHEMA_MARKER);
}

function isJournalSchema(schemaRef: unknown): boolean {
  return typeof schemaRef === "string" && schemaRef.includes("/journal/");
}

function isCommodityMessage(value: unknown): value is EddnCommodityMessage {
  return isPlainObject(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isExpectedCloseError(error: unknown): boolean {
  return error instanceof Error && /Socket is closed|Operation was interrupted/u.test(error.message);
}
