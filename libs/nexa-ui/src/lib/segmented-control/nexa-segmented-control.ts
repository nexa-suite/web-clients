import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface NexaSegmentOption { readonly value: string; readonly label: string; readonly disabled?: boolean; }
export type NexaSegmentedSize = 'compact' | 'standard';

@Component({
  selector: 'nexa-segmented-control',
  templateUrl: './nexa-segmented-control.html',
  styleUrl: './nexa-segmented-control.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NexaSegmentedControl {
  readonly label = input.required<string>();
  readonly options = input.required<readonly NexaSegmentOption[]>();
  readonly selected = model.required<string>();
  readonly size = input<NexaSegmentedSize>('standard');

  protected choose(option: NexaSegmentOption): void {
    if (!option.disabled) this.selected.set(option.value);
  }
}
