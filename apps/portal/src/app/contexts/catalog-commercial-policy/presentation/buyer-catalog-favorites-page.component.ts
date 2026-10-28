import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
} from "@angular/core";
import { DatePipe } from "@angular/common";
import { RouterLink } from "@angular/router";
import { NexaButton, NexaSurface, NexaStatusChip } from "nexa-ui";
import type { BuyerCatalogFavoriteResponse } from "@nexa/api";
import { PortalSessionStore } from "../../tenant-access-governance/application/public-api";
import {
  canAccessPortalFeature,
  PORTAL_ACCESS_RULES,
} from "../../../core/portal-access-policy";
import { BuyerCatalogFavoritesStore } from "../application/buyer-catalog-favorites.store";

@Component({
  selector: "portal-buyer-catalog-favorites-page",
  standalone: true,
  imports: [DatePipe, NexaButton, NexaSurface, NexaStatusChip, RouterLink],
  templateUrl: "./buyer-catalog-favorites-page.component.html",
  styleUrl: "./buyer-catalog-favorites-page.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BuyerCatalogFavoritesPageComponent implements OnInit {
  protected readonly store = inject(BuyerCatalogFavoritesStore);
  private readonly sessions = inject(PortalSessionStore);
  protected readonly canReadFavorites = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      canAccessPortalFeature(
        current.session,
        PORTAL_ACCESS_RULES.catalogFavoritesRead,
      )
    );
  });
  protected readonly canManageFavorites = computed(() => {
    const current = this.sessions.state();
    return (
      current.status === "authenticated" &&
      canAccessPortalFeature(
        current.session,
        PORTAL_ACCESS_RULES.catalogFavoritesWrite,
      )
    );
  });

  ngOnInit(): void {
    if (this.canReadFavorites()) void this.store.load();
  }

  protected imageUrl(favorite: BuyerCatalogFavoriteResponse): string | null {
    const offer = favorite.currentOffer;
    const fileName = offer?.imageFileName?.trim();
    const imageUrl = offer?.imageUrl?.trim();
    if (
      !fileName ||
      !imageUrl ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*\.(?:png|jpe?g|webp)$/i.test(fileName) ||
      fileName.includes("..") ||
      imageUrl !== `/catalog-items/${fileName}`
    ) {
      return null;
    }
    return imageUrl;
  }

  protected remove(sellableSkuId: string): void {
    if (!this.canManageFavorites()) return;
    void this.store.remove(sellableSkuId);
  }

  protected availabilityLabel(status: string): string {
    switch (status) {
      case "AVAILABLE":
        return "Available";
      case "LOW":
        return "Low availability";
      case "OUT_OF_STOCK":
        return "Out of stock";
      default:
        return "Availability unconfirmed";
    }
  }

  protected availabilityTone(
    status: string,
  ): "success" | "warning" | "danger" | "neutral" {
    switch (status) {
      case "AVAILABLE":
        return "success";
      case "LOW":
        return "warning";
      case "OUT_OF_STOCK":
        return "danger";
      default:
        return "neutral";
    }
  }
}
