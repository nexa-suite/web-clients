import { NexaCommandRetryStore } from "@nexa/api";
import type { WalletRefundRequest } from "@nexa/api";
import type { PlatformSessionLease } from "../../tenant-access-governance/application/public-api";
import { PlatformSessionStore } from "../../tenant-access-governance/application/public-api";
import { walletRefundRetryIdentity } from "./wallet-refund-command-retry";

describe("walletRefundRetryIdentity", () => {
  const lease: PlatformSessionLease = {
    epoch: 4,
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      membershipId: "membership-1",
      surface: "PLATFORM",
    },
  };

  let values: Map<string, string>;
  let retries: Pick<NexaCommandRetryStore, "read" | "write">;
  let sessions: Pick<PlatformSessionStore, "isSessionLeaseCurrent">;

  beforeEach(() => {
    values = new Map();
    retries = {
      read: vi.fn((key) => values.get(key) ?? null),
      write: vi.fn((key, value) => values.set(key, value)),
    } as unknown as Pick<NexaCommandRetryStore, "read" | "write">;
    sessions = {
      isSessionLeaseCurrent: vi.fn(
        (candidate) => candidate.epoch === lease.epoch,
      ),
    } as unknown as Pick<PlatformSessionStore, "isSessionLeaseCurrent">;
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reuses an opaque key for the same payload and scopes changed intent by SHA-256", async () => {
    const digest = vi.fn(async (_algorithm: string, data: Uint8Array) => {
      const payload = new TextDecoder().decode(data);
      return new Uint8Array(32).fill(payload.includes("Second reason") ? 2 : 1)
        .buffer;
    });
    const randomUUID = vi
      .fn()
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174010")
      .mockReturnValueOnce("123e4567-e89b-42d3-a456-426614174011");
    vi.stubGlobal("crypto", { subtle: { digest }, randomUUID });
    const request: WalletRefundRequest = {
      amountPEN: 25.5,
      reason: "Duplicate debit",
    };

    const first = await walletRefundRetryIdentity(
      retries as NexaCommandRetryStore,
      sessions as PlatformSessionStore,
      lease,
      "order/1",
      request,
    );
    const retry = await walletRefundRetryIdentity(
      retries as NexaCommandRetryStore,
      sessions as PlatformSessionStore,
      lease,
      "order/1",
      request,
    );
    const changed = await walletRefundRetryIdentity(
      retries as NexaCommandRetryStore,
      sessions as PlatformSessionStore,
      lease,
      "order/1",
      { amountPEN: 26, reason: "Second reason" },
    );

    expect(first?.key).toBe("123e4567-e89b-42d3-a456-426614174010");
    expect(retry).toEqual(first);
    expect(changed?.key).toBe("123e4567-e89b-42d3-a456-426614174011");
    expect(first?.storageKey).toMatch(
      /^nexa:platform:wallet-refund:user-1:tenant-1:workspace-1:membership-1:order%2F1:[a-f0-9]{64}$/,
    );
    expect(first?.storageKey).not.toContain("Duplicate debit");
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(retries.write).toHaveBeenCalledTimes(2);
  });

  it("does not create a command identity when the session lease is stale or Web Crypto is unavailable", async () => {
    vi.stubGlobal("crypto", undefined);
    vi.mocked(sessions.isSessionLeaseCurrent).mockReturnValue(false);

    const identity = await walletRefundRetryIdentity(
      retries as NexaCommandRetryStore,
      sessions as PlatformSessionStore,
      lease,
      "order-1",
      { amountPEN: 10, reason: "Correction" },
    );

    expect(identity).toBeNull();
    expect(retries.write).not.toHaveBeenCalled();
  });
});
