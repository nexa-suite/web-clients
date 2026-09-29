import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  EnvironmentInjector,
  ElementRef,
  QueryList,
  ViewChildren,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

export interface NexaActionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly separatorBefore?: boolean;
}

@Component({
  selector: 'nexa-action-menu',
  templateUrl: './nexa-action-menu.html',
  styleUrl: './nexa-action-menu.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:pointerdown)': 'handleDocumentPointerDown($event)',
    '(document:keydown)': 'handleDocumentKeydown($event)',
    '(keydown)': 'handleKeydown($event)',
  },
})
export class NexaActionMenu {
  readonly triggerId = input.required<string>();
  readonly triggerLabel = input.required<string>();
  readonly menuLabel = input.required<string>();
  readonly size = input<'default' | 'compact'>('default');
  readonly items = input.required<readonly NexaActionMenuItem[]>();
  readonly selected = output<string>();
  protected readonly open = signal(false);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly environmentInjector = inject(EnvironmentInjector);

  @ViewChildren('menuItem')
  private readonly menuItems!: QueryList<ElementRef<HTMLButtonElement>>;

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    this.open.set(true);
    this.scheduleFocus(0);
  }

  protected activate(item: NexaActionMenuItem): void {
    if (item.disabled) return;
    this.selected.emit(item.id);
    this.close();
  }

  protected handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.open.set(true);
    this.scheduleFocus(event.key === 'ArrowUp' ? this.lastEnabledIndex() : 0);
  }

  protected handleDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.close();
  }

  protected handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  protected handleMenuKeydown(event: KeyboardEvent): void {
    const enabled = this.enabledIndexes();
    if (!enabled.length) return;
    const current = this.currentItemIndex();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      const currentPosition = Math.max(0, enabled.indexOf(current));
      this.focusItem(enabled[(currentPosition + direction + enabled.length) % enabled.length]);
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      this.focusItem(event.key === 'Home' ? enabled[0] : enabled[enabled.length - 1]);
    } else if (event.key === 'Tab') {
      this.close(false);
    }
  }

  protected handleItemKeydown(event: KeyboardEvent, item: NexaActionMenuItem): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.activate(item);
  }

  protected close(restoreFocus = true): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) queueMicrotask(() => this.triggerElement()?.focus());
  }

  protected handleDocumentPointerDown(event: PointerEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  private focusItem(index: number): void {
    const item = this.menuItems?.get(index)?.nativeElement;
    item?.focus();
  }

  private scheduleFocus(index: number): void {
    afterNextRender(() => {
      if (this.open()) this.focusItem(index);
    }, { injector: this.environmentInjector });
  }

  private triggerElement(): HTMLButtonElement | null {
    const host = this.host.nativeElement as HTMLElement;
    return host.querySelector<HTMLButtonElement>('.menu-trigger');
  }

  private enabledIndexes(): readonly number[] {
    return this.items().flatMap((item, index) => item.disabled ? [] : [index]);
  }

  private lastEnabledIndex(): number {
    const indexes = this.enabledIndexes();
    return indexes[indexes.length - 1] ?? 0;
  }

  private currentItemIndex(): number {
    const active = (this.host.nativeElement as HTMLElement).ownerDocument?.activeElement;
    return this.menuItems?.toArray().findIndex((item) => item.nativeElement === active) ?? -1;
  }

}
