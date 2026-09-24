import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

type TooltipPlacement = 'below' | 'above' | 'start' | 'end';

@Component({
  selector: 'nexa-tooltip',
  templateUrl: './nexa-tooltip.html',
  styleUrl: './nexa-tooltip.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(pointerenter)': 'cancelHide()',
    '(pointerleave)': 'scheduleHide()',
    '(focusin)': 'show()',
    '(focusout)': 'handleFocusOut($event)',
    '(keydown)': 'handleKeydown($event)',
  },
})
export class NexaTooltip {
  readonly id = input.required<string>();
  readonly content = input.required<string>();
  readonly triggerLabel = input.required<string>();
  readonly visible = signal(false);
  readonly placement = signal<TooltipPlacement>('below');
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly destroyRef = inject(DestroyRef);
  private hideTimer: number | undefined;
  private positionTimer: number | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.cancelHide();
      if (this.positionTimer !== undefined) window.clearTimeout(this.positionTimer);
    });
  }

  protected show(): void {
    this.cancelHide();
    this.visible.set(true);
    if (this.positionTimer !== undefined) window.clearTimeout(this.positionTimer);
    this.positionTimer = window.setTimeout(() => this.positionTooltip(), 0);
  }

  protected scheduleHide(): void {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.visible.set(false), 120);
  }

  protected cancelHide(): void {
    if (this.hideTimer !== undefined) window.clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }

  private positionTooltip(): void {
    this.positionTimer = undefined;
    const host = this.host.nativeElement as HTMLElement;
    const trigger = host.querySelector<HTMLElement>('.tooltip-trigger');
    const tooltip = host.querySelector<HTMLElement>('.tooltip');
    if (!trigger || !tooltip) return;

    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const hostRect = host.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const candidates: readonly { placement: TooltipPlacement; x: number; y: number }[] = [
      { placement: 'below', x: triggerRect.left, y: triggerRect.bottom + gap },
      { placement: 'above', x: triggerRect.left, y: triggerRect.top - tooltipRect.height - gap },
      { placement: 'end', x: triggerRect.right + gap, y: triggerRect.top },
      { placement: 'start', x: triggerRect.left - tooltipRect.width - gap, y: triggerRect.top },
    ];
    const candidate = candidates.find(({ x, y }) => (
      x >= margin && y >= margin && x + tooltipRect.width <= window.innerWidth - margin && y + tooltipRect.height <= window.innerHeight - margin
    )) ?? candidates[0];
    const x = Math.max(margin, Math.min(candidate.x, window.innerWidth - margin - tooltipRect.width));
    const y = Math.max(margin, Math.min(candidate.y, window.innerHeight - margin - tooltipRect.height));
    tooltip.style.setProperty('--nexa-tooltip-left', `${x - hostRect.left}px`);
    tooltip.style.setProperty('--nexa-tooltip-top', `${y - hostRect.top}px`);
    this.placement.set(candidate.placement);
  }

  protected handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !this.host.nativeElement.contains(next)) this.scheduleHide();
  }

  protected dismiss(event: Event): void {
    event.preventDefault();
    this.cancelHide();
    this.visible.set(false);
    const host = this.host.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.tooltip-trigger')?.focus();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.dismiss(event);
  }
}
