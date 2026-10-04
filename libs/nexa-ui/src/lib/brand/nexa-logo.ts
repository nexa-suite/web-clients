import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

export type NexaLogoVariant = 'primary' | 'inverse';

@Component({
  selector: 'nexa-logo',
  templateUrl: './nexa-logo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nexa-logo.scss',
})
export class NexaLogo {
  private readonly document = inject(DOCUMENT);
  readonly variant = input<NexaLogoVariant>('primary');
  readonly alt = input('Nexa');
  readonly decorative = input(false);
  protected readonly source = computed(() => {
    const asset = this.variant() === 'inverse'
      ? 'brand/canonical/Documento.svg'
      : 'brand/canonical/logo-nexa.svg';
    return new URL(asset, this.document.baseURI).toString();
  });
}
