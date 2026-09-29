import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

@Component({
  selector: 'nexa-numeric-stepper',
  templateUrl: './nexa-numeric-stepper.html',
  styleUrl: './nexa-numeric-stepper.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NexaNumericStepper {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly value = model(1);
  readonly min = input(0);
  readonly max = input(99);
  readonly step = input(1);
  readonly disabled = input(false);

  protected decrement(): void { this.value.update((value) => Math.max(this.min(), value - this.step())); }
  protected increment(): void { this.value.update((value) => Math.min(this.max(), value + this.step())); }
}
