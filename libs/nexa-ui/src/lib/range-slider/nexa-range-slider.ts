import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'nexa-range-slider',
  templateUrl: './nexa-range-slider.html',
  styleUrl: './nexa-range-slider.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NexaRangeSlider {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model(50);
  readonly min = input(0);
  readonly max = input(100);
  readonly step = input(1);
  readonly unit = input('');
  readonly disabled = input(false);

  protected update(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.value.set(Number(target.value));
  }
}
