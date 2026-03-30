import { AsyncLocalStorage } from "node:async_hooks";
import type { Prisma, PrismaClient } from "@prisma/client";

export type PrismaQueryTimingSnapshot = {
  queryCount: number;
  totalDurationMs: number;
};

type PrismaQueryTimingState = {
  queryCount: number;
  totalDurationMs: number;
};

const prismaQueryTimingStore = new AsyncLocalStorage<PrismaQueryTimingState>();
const instrumentedPrismaClients = new WeakSet<object>();

type QueryEventCapablePrismaClient = PrismaClient<
  Prisma.PrismaClientOptions,
  "query" | "error" | "warn"
>;

function roundDuration(value: number) {
  return Number(value.toFixed(2));
}

export function recordPrismaQueryTiming(durationMs: number) {
  const state = prismaQueryTimingStore.getStore();
  if (!state || !Number.isFinite(durationMs) || durationMs < 0) return;

  state.queryCount += 1;
  state.totalDurationMs += durationMs;
}

export function installPrismaQueryTiming(prisma: QueryEventCapablePrismaClient) {
  if (instrumentedPrismaClients.has(prisma)) return;

  prisma.$on("query", (event) => {
    recordPrismaQueryTiming(event.duration);
  });
  instrumentedPrismaClients.add(prisma);
}

export async function capturePrismaQueryTiming<T>(fn: () => Promise<T>): Promise<{
  result?: T;
  error?: unknown;
  snapshot: PrismaQueryTimingSnapshot;
}> {
  const state: PrismaQueryTimingState = {
    queryCount: 0,
    totalDurationMs: 0,
  };

  try {
    const result = await prismaQueryTimingStore.run(state, fn);
    return {
      result,
      snapshot: {
        queryCount: state.queryCount,
        totalDurationMs: roundDuration(state.totalDurationMs),
      },
    };
  } catch (error) {
    return {
      error,
      snapshot: {
        queryCount: state.queryCount,
        totalDurationMs: roundDuration(state.totalDurationMs),
      },
    };
  }
}
