import { Prisma, PrismaClient } from "@prisma/client";

type InstrumentedPrismaClient = PrismaClient<
  Prisma.PrismaClientOptions,
  "query" | "error" | "warn"
>;

declare global {
  // eslint-disable-next-line no-var
  var prisma: InstrumentedPrismaClient | undefined;
}

export const prisma =
  globalThis.prisma ||
  (new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? [{ emit: "event", level: "query" }, "error", "warn"]
        : [{ emit: "event", level: "query" }, "error"],
  }) as InstrumentedPrismaClient);

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
