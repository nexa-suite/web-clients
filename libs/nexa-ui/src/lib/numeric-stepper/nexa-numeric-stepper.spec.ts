import { TestBed } from '@angular/core/testing';
import { NexaNumericStepper } from './nexa-numeric-stepper';

describe('NexaNumericStepper', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaNumericStepper] }));

  it('clamps values at the configured maximum', () => {
    const fixture = TestBed.createComponent(NexaNumericStepper);
    fixture.componentRef.setInput('id', 'quantity');
    fixture.componentRef.setInput('label', 'Quantity');
    fixture.componentRef.setInput('min', 1);
    fixture.componentRef.setInput('max', 2);
    fixture.componentInstance.value.set(2);
    fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(fixture.componentInstance.value()).toBe(2);
  });
});
