import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  configMock,
  prismaClientCtorMock,
  prismaPgCtorMock,
} = vi.hoisted(() => ({
  configMock: vi.fn(),
  prismaClientCtorMock: vi.fn(),
  prismaPgCtorMock: vi.fn(),
}));

vi.mock("dotenv", () => ({
  config: configMock,
}));

vi.mock("@prisma/adapter-pg", () => ({
  PrismaPg: vi.fn(function PrismaPgMock(args: unknown) {
    prismaPgCtorMock(args);
    return { __adapter: true };
  }),
}));

vi.mock("@prisma/client", () => ({
  PrismaClient: vi.fn(function PrismaClientMock(args: unknown) {
    prismaClientCtorMock(args);
    return { $disconnect: vi.fn() };
  }),
}));

describe("worker db client", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete (globalThis as any).prisma;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("throws when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("../db/client.js")).rejects.toThrow(
      "DATABASE_URL is required to initialize Prisma"
    );
  });

  it("creates prisma with adapter and stores global instance in non-production", async () => {
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "development";

    const module = await import("../db/client.js");

    expect(configMock).toHaveBeenCalledTimes(2);
    expect(prismaPgCtorMock).toHaveBeenCalledWith({ connectionString: "postgres://db" });
    expect(prismaClientCtorMock).toHaveBeenCalledTimes(1);
    expect(module.prisma).toBe((globalThis as any).prisma);
  });

  it("reuses global prisma if already present", async () => {
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "development";
    const existing = { marker: "existing-prisma" };
    (globalThis as any).prisma = existing;

    const module = await import("../db/client.js");

    expect(module.prisma).toBe(existing);
    expect(prismaClientCtorMock).not.toHaveBeenCalled();
  });

  it("does not assign global prisma in production", async () => {
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "production";

    const module = await import("../db/client.js");

    expect(module.prisma).toBeDefined();
    expect((globalThis as any).prisma).toBeUndefined();
  });
});
