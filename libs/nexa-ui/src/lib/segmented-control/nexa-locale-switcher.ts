import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { NexaSegmentedControl, type NexaSegmentOption } from './nexa-segmented-control';

export type NexaLocale = 'en' | 'es';

@Component({
  selector: 'nexa-locale-switcher',
  imports: [NexaSegmentedControl],
  templateUrl: './nexa-locale-switcher.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NexaLocaleSwitcher {
  readonly label = input('Specimen language');
  readonly locale = model<NexaLocale>('en');
  protected readonly options: readonly NexaSegmentOption[] = [
    { value: 'en', label: 'EN' },
    { value: 'es', label: 'ES' },
  ];

  protected choose(value: string): void {
    if (value === 'en' || value === 'es') this.locale.set(value);
  }
}
