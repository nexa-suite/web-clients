import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type NexaStatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';
export type NexaStatusEmphasis = 'subtle' | 'standard' | 'strong';

@Component({
  selector: 'nexa-status-chip',
  templateUrl: './nexa-status-chip.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nexa-status-chip.scss',
})
export class NexaStatusChip {
  readonly tone = input<NexaStatusTone>('neutral');
  readonly emphasis = input<NexaStatusEmphasis>('subtle');
  protected readonly classes = computed(() => `${this.tone()} ${this.emphasis()}`);
}
