import { computed, effect, inject, Injectable, signal } from "@angular/core";
import type { BuyerCatalogItem } from "../../catalog-commercial-policy/application/public-api";
import {
  PortalSessionStore,
  type PortalSessionLease,
} from "../../tenant-access-governance/application/public-api";

export interface BuyerRequestSelectionLine {
  readonly skuId: string;
  readonly quantity: number;
  readonly unit: string;
  readonly notes: string;
  readonly item: BuyerCatalogItem;
}

export type BuyerRequestSelectionAddResult =
  | "added"
  | "incremented"
  | "line-limit"
  | "unavailable"
  | "no-session";

const MAX_REQUEST_LINES = 100;

/** Temporary, session-scoped shopping selection; the API remains draft authority. */
@Injectable({ providedIn: "root" })
export class BuyerRequestSelectionStore {
  private readonly sessions = inject(PortalSessionStore);
  private readonly snapshot = signal<{
    readonly lease: PortalSessionLease;
    readonly lines: readonly BuyerRequestSelectionLine[];
  } | null>(null);

  readonly lines = computed(() => {
    const lease = this.sessions.captureSessionLease();
    const current = this.snapshot();
    return lease && current && sameLease(current.lease, lease)
      ? current.lines
      : [];
  });
  readonly productCount = computed(() => this.lines().length);

  constructor() {
    effect(() => {
      const lease = this.sessions.captureSessionLease();
      const current = this.snapshot();
      if (
        current &&
        (!lease || !sameLease(current.lease, lease))
      ) {
        this.snapshot.set(null);
      }
    });
  }

  has(skuId: string | null | undefined): boolean {
    const normalized = skuId?.trim();
    return Boolean(normalized && this.lines().some((line) => line.skuId === normalized));
  }

  quantityFor(skuId: string | null | undefined): number {
    const normalized = skuId?.trim();
    if (!normalized) return 0;
    return this.lines().find((line) => line.skuId === normalized)?.quantity ?? 0;
  }

  add(item: BuyerCatalogItem): BuyerRequestSelectionAddResult {
    const skuId = item.sellableSkuId?.trim();
    const lease = this.sessions.captureSessionLease();
    if (!lease) return "no-session";
    if (!skuId || item.availabilityStatus === "OUT_OF_STOCK") {
      return "unavailable";
    }

    const lines = this.lines();
    const existing = lines.find((line) => line.skuId === skuId);
    if (existing) {
      this.write(
        lines.map((line) =>
          line.skuId === skuId
            ? { ...line, quantity: line.quantity + 1, item }
            : line,
        ),
        lease,
      );
      return "incremented";
    }
    if (lines.length >= MAX_REQUEST_LINES) return "line-limit";

    this.write(
      [
        ...lines,
        { skuId, quantity: 1, unit: "", notes: "", item },
      ],
      lease,
    );
    return "added";
  }

  replace(
    lines: readonly BuyerRequestSelectionLine[],
    expectedLease?: PortalSessionLease | null,
  ): boolean {
    const lease = this.sessions.captureSessionLease();
    if (
      !lease ||
      (expectedLease && !sameLease(expectedLease, lease)) ||
      lines.length > MAX_REQUEST_LINES
    ) {
      return false;
    }
    const unique = new Map<string, BuyerRequestSelectionLine>();
    for (const line of lines) {
      const skuId = line.skuId.trim();
      if (!skuId || !Number.isFinite(line.quantity) || line.quantity <= 0) {
        continue;
      }
      unique.set(skuId, { ...line, skuId });
    }
    this.write([...unique.values()], lease);
    return true;
  }

  setQuantity(skuId: string, quantity: number): void {
    const normalized = skuId.trim();
    if (!normalized || !Number.isFinite(quantity)) return;
    if (quantity <= 0) {
      this.remove(normalized);
      return;
    }
    const lease = this.sessions.captureSessionLease();
    if (!lease) return;
    this.write(
      this.lines().map((line) =>
        line.skuId === normalized ? { ...line, quantity } : line,
      ),
      lease,
    );
  }

  adjustQuantity(skuId: string, delta: number): void {
    const current = this.quantityFor(skuId);
    if (current <= 0 || !Number.isFinite(delta)) return;
    this.setQuantity(skuId, current + delta);
  }

  remove(skuId: string): void {
    const normalized = skuId.trim();
    const lease = this.sessions.captureSessionLease();
    if (!lease || !normalized) return;
    this.write(
      this.lines().filter((line) => line.skuId !== normalized),
      lease,
    );
  }

  clear(): void {
    this.snapshot.set(null);
  }

  private write(
    lines: readonly BuyerRequestSelectionLine[],
    lease: PortalSessionLease,
  ): void {
    if (this.sessions.isSessionLeaseCurrent(lease)) {
      this.snapshot.set({ lease, lines });
    }
  }
}

function sameLease(
  left: PortalSessionLease,
  right: PortalSessionLease,
): boolean {
  return (
    left.epoch === right.epoch &&
    left.scope.userId === right.scope.userId &&
    left.scope.tenantId === right.scope.tenantId &&
    left.scope.workspaceId === right.scope.workspaceId &&
    left.scope.membershipId === right.scope.membershipId &&
    left.scope.surface === right.scope.surface
  );
}
