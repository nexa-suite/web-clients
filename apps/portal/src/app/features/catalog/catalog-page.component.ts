import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NexaButton, NexaStatusChip, NexaSurface, NexaTextField } from 'nexa-ui';
import { CatalogStore } from './catalog.store';

@Component({
  selector: 'portal-catalog-page',
  standalone: true,
  imports: [NexaButton, NexaStatusChip, NexaSurface, NexaTextField, RouterLink],
  templateUrl: './catalog-page.component.html',
  styleUrl: './catalog-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPageComponent implements OnInit {
  protected readonly store = inject(CatalogStore);
  protected readonly q = signal('');
  protected readonly brand = signal('');
  protected readonly category = signal('');
  protected readonly coldChain = signal('');
  protected readonly coldChainOptions = [
    { value: '', label: 'All requirements' },
    { value: 'NONE', label: 'None' },
    { value: 'REFRIGERATED', label: 'Refrigerated' },
    { value: 'FROZEN', label: 'Frozen' },
  ] as const;

  ngOnInit(): void {
    const search = this.store.search();
    this.q.set(search.q);
    this.brand.set(search.brand);
    this.category.set(search.category);
    this.coldChain.set(search.coldChain);
    void this.store.load();
  }

  protected async search(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    await this.store.applySearch({
      q: this.q(),
      brand: this.brand(),
      category: this.category(),
      coldChain: this.coldChain() as '' | 'NONE' | 'REFRIGERATED' | 'FROZEN',
    });
  }

  protected async pageBy(offset: number): Promise<void> {
    await this.store.changePage(this.store.search().page + offset);
  }

  protected clear(): void {
    this.q.set('');
    this.brand.set('');
    this.category.set('');
    this.coldChain.set('');
    void this.store.applySearch({ q: '', brand: '', category: '', coldChain: '' });
  }
}
