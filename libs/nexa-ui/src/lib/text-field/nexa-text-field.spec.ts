import { TestBed } from '@angular/core/testing';
import { NexaTextField } from './nexa-text-field';

describe('NexaTextField', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaTextField] }));

  it('keeps value and support associations truthful', () => {
    const fixture = TestBed.createComponent(NexaTextField);
    fixture.componentRef.setInput('id', 'email');
    fixture.componentRef.setInput('label', 'Email');
    fixture.componentRef.setInput('helper', 'Use your work address.');
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    input.value = 'person@nexa.test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.componentInstance.value()).toBe('person@nexa.test');
    expect(input.getAttribute('aria-labelledby')).toBe('email-label');
    expect(input.getAttribute('aria-describedby')).toBe('email-help');
  });
});
