import { TestBed } from '@angular/core/testing';
import { NexaRangeSlider } from './nexa-range-slider';

describe('NexaRangeSlider', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaRangeSlider] }));

  it('reports a user-selected value with its unit', () => {
    const fixture = TestBed.createComponent(NexaRangeSlider);
    fixture.componentRef.setInput('id', 'temperature');
    fixture.componentRef.setInput('label', 'Temperature');
    fixture.componentRef.setInput('unit', '°C');
    fixture.detectChanges();
    const slider = fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = '7';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe(7);
    expect(fixture.nativeElement.querySelector('output')?.textContent).toContain('7°C');
  });
});
