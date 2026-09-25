import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NexaButton, NexaStatusChip, NexaSurface } from 'nexa-ui';
import { CatalogStore } from './catalog.store';

@Component({
  selector: 'portal-catalog-detail-page',
  standalone: true,
  imports: [NexaButton, NexaStatusChip, NexaSurface, RouterLink],
  templateUrl: './catalog-detail-page.component.html',
  styleUrl: './catalog-detail-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogDetailPageComponent implements OnInit {
  protected readonly store = inject(CatalogStore);
  protected readonly route = inject(ActivatedRoute);

  ngOnInit(): void {
    const catalogItemId = this.route.snapshot.paramMap.get('catalogItemId');
    if (catalogItemId) void this.store.loadDetail(catalogItemId);
  }
}
