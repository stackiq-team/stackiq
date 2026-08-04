import { describe, expect, it, vi } from "vitest";

const { connectDBMock, listenMock, appMock } = vi.hoisted(() => {
  const listen = vi.fn((port: number, callback?: () => void) => {
    callback?.();
    return { close: vi.fn() };
  });

  return {
    connectDBMock: vi.fn().mockResolvedValue(undefined),
    listenMock: listen,
    appMock: { listen },
  };
});

vi.mock("./db/client", () => ({
  connectDB: connectDBMock,
}));

vi.mock("./app", () => ({
  app: appMock,
}));

describe("backend startup", () => {
  it("connects to db then starts listening on port 4000", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const module = await import("./index");
    await Promise.resolve();

    expect(connectDBMock).toHaveBeenCalledTimes(1);
    expect(listenMock).toHaveBeenCalledWith(4000, expect.any(Function));
    expect(logSpy).toHaveBeenCalledWith("Backend running on http://localhost:4000");
    expect(module.default).toBe(appMock);

    logSpy.mockRestore();
  });
});
