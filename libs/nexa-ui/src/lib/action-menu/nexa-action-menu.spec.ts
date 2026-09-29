import { TestBed } from '@angular/core/testing';
import { NexaActionMenu, type NexaActionMenuItem } from './nexa-action-menu';

describe('NexaActionMenu', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaActionMenu] }));

  it('keeps keyboard navigation, disabled items and escape truthful', async () => {
    const items: readonly NexaActionMenuItem[] = [
      { id: 'review', label: 'Review request', shortcut: 'Enter' },
      { id: 'disabled', label: 'Unavailable command', disabled: true },
      { id: 'cancel', label: 'Cancel request', destructive: true },
    ];
    const fixture = TestBed.createComponent(NexaActionMenu);
    fixture.componentRef.setInput('triggerId', 'test-menu');
    fixture.componentRef.setInput('triggerLabel', 'Commands');
    fixture.componentRef.setInput('menuLabel', 'Request commands');
    fixture.componentRef.setInput('items', items);
    let selected = '';
    fixture.componentInstance.selected.subscribe((id) => selected = id);
    fixture.detectChanges();

    const trigger = fixture.nativeElement.querySelector('.menu-trigger') as HTMLButtonElement;
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    const menuItems = fixture.nativeElement.querySelectorAll('.menu-item') as NodeListOf<HTMLButtonElement>;
    expect(document.activeElement).toBe(menuItems[0]);
    expect(menuItems[1].disabled).toBe(true);

    menuItems[0].click();
    fixture.detectChanges();
    expect(selected).toBe('review');
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();

    trigger.click();
    fixture.detectChanges();
    const menu = fixture.nativeElement.querySelector('[role="menu"]') as HTMLElement;
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);

    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges();
    const reopenedItems = fixture.nativeElement.querySelectorAll('.menu-item') as NodeListOf<HTMLButtonElement>;
    expect(document.activeElement).toBe(reopenedItems[0]);
    reopenedItems[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(selected).toBe('review');
  });
});
