import { ChangeDetectionStrategy, Component, ElementRef, inject, input, model, output } from '@angular/core';
import type { FormCheckboxControl } from '@angular/forms/signals';

@Component({
  selector: 'nexa-toggle',
  templateUrl: './nexa-toggle.html',
  styleUrl: './nexa-toggle.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NexaToggle implements FormCheckboxControl {
  readonly id = input.required<string>();
  readonly label = input.required<string>();
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly touch = output<void>();
  private readonly host = inject(ElementRef<HTMLElement>);

  protected update(event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.checked.set(target.checked);
  }

  focus(options?: FocusOptions): void {
    (this.host.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input')?.focus(options);
  }
}
