import { TestBed } from '@angular/core/testing';
import { NexaToggle } from './nexa-toggle';

describe('NexaToggle', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaToggle] }));

  it('updates checked state through the switch interaction', () => {
    const fixture = TestBed.createComponent(NexaToggle);
    fixture.componentRef.setInput('id', 'alerts');
    fixture.componentRef.setInput('label', 'Alerts');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('input[role="switch"]') as HTMLInputElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.checked()).toBe(true);
  });
});
