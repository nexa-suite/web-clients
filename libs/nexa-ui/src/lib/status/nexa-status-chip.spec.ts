import { TestBed } from '@angular/core/testing';
import { NexaStatusChip } from './nexa-status-chip';

describe('NexaStatusChip', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaStatusChip] }));

  it('keeps semantic tone and emphasis in the rendered state', () => {
    const fixture = TestBed.createComponent(NexaStatusChip);
    fixture.componentRef.setInput('tone', 'danger');
    fixture.componentRef.setInput('emphasis', 'strong');
    fixture.detectChanges();

    const chip = fixture.nativeElement.querySelector('.nexa-status-chip') as HTMLElement;
    expect(chip.classList.contains('danger')).toBe(true);
    expect(chip.classList.contains('strong')).toBe(true);
  });

  it('exposes every public tone and emphasis combination to the visual contract', () => {
    const tones = ['success', 'info', 'warning', 'danger', 'neutral'] as const;
    const emphases = ['subtle', 'standard', 'strong'] as const;

    for (const tone of tones) {
      for (const emphasis of emphases) {
        const fixture = TestBed.createComponent(NexaStatusChip);
        fixture.componentRef.setInput('tone', tone);
        fixture.componentRef.setInput('emphasis', emphasis);
        fixture.detectChanges();

        const chip = fixture.nativeElement.querySelector('.nexa-status-chip') as HTMLElement;
        expect(chip.classList.contains(tone)).toBe(true);
        expect(chip.classList.contains(emphasis)).toBe(true);
        fixture.destroy();
      }
    }
  });
});
