import { TestBed } from '@angular/core/testing';
import { NexaTooltip } from './nexa-tooltip';

describe('NexaTooltip', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaTooltip] }));

  it('exposes tooltip semantics only while visible and restores focus on escape', async () => {
    const fixture = TestBed.createComponent(NexaTooltip);
    fixture.componentRef.setInput('id', 'test-tooltip');
    fixture.componentRef.setInput('triggerLabel', 'Explain status');
    fixture.componentRef.setInput('content', 'This status needs review.');
    fixture.detectChanges();
    const trigger = fixture.nativeElement.querySelector('.tooltip-trigger') as HTMLButtonElement;
    expect(trigger.getAttribute('aria-describedby')).toBeNull();
    trigger.focus();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeTruthy();
    expect(trigger.getAttribute('aria-describedby')).toBe('test-tooltip');
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="tooltip"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
