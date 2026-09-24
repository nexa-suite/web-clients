import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type NexaLogoVariant = 'primary' | 'inverse';

@Component({
  selector: 'nexa-logo',
  templateUrl: './nexa-logo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nexa-logo.scss',
})
export class NexaLogo {
  readonly variant = input<NexaLogoVariant>('primary');
  readonly alt = input('Nexa');
  readonly decorative = input(false);
  protected readonly source = computed(() => this.variant() === 'inverse'
    ? '/brand/canonical/Documento.svg'
    : '/brand/canonical/logo-nexa.svg');
}
