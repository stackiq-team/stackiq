import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  configMock,
  prismaClientCtorMock,
  prismaPgCtorMock,
  connectMock,
} = vi.hoisted(() => ({
  configMock: vi.fn(),
  prismaClientCtorMock: vi.fn(),
  prismaPgCtorMock: vi.fn(),
  connectMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../generated/prisma/client", () => ({
  PrismaClient: vi.fn(function PrismaClientMock(args: unknown) {
    prismaClientCtorMock(args);
    return { $connect: connectMock };
  }),
}));

describe("backend db client", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup };
    delete (globalThis as any).prisma;
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("throws when DATABASE_URL is missing", async () => {
    delete process.env.DATABASE_URL;

    await expect(import("./client")).rejects.toThrow(
      "DATABASE_URL is required to initialize Prisma"
    );
  });

  it("creates prisma with adapter and stores global instance in non-production", async () => {
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "development";

    const module = await import("./client");

    expect(configMock).toHaveBeenCalledTimes(2);
    expect(configMock).toHaveBeenNthCalledWith(1, { path: ".env" });
    expect(configMock).toHaveBeenNthCalledWith(2, { path: "../.env", override: false });
    expect(prismaPgCtorMock).toHaveBeenCalledWith({ connectionString: "postgres://db" });
    expect(prismaClientCtorMock).toHaveBeenCalledTimes(1);
    expect(module.prisma).toBe((globalThis as any).prisma);
  });

  it("reuses global prisma if already present", async () => {
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "development";
    const existing = { marker: "existing-prisma", $connect: vi.fn() };
    (globalThis as any).prisma = existing;

    const module = await import("./client");

    expect(module.prisma).toBe(existing);
    expect(prismaClientCtorMock).not.toHaveBeenCalled();
  });

  it("does not assign global prisma in production", async () => {
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "production";

    const module = await import("./client");

    expect(module.prisma).toBeDefined();
    expect((globalThis as any).prisma).toBeUndefined();
  });

  it("connectDB calls prisma.$connect and logs", async () => {
    process.env.DATABASE_URL = "postgres://db";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const module = await import("./client");

    await module.connectDB();

    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith("Database connected with Prisma");

    logSpy.mockRestore();
  });
});
