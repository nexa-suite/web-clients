import { Component, signal } from '@angular/core';
import { FormField, form, required } from '@angular/forms/signals';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NexaTextField } from '../text-field/nexa-text-field';
import { NexaToggle } from '../toggle/nexa-toggle';

@Component({
  standalone: true,
  imports: [FormField, NexaTextField, NexaToggle],
  template: `
    <nexa-text-field id="email" label="Email" [formField]="profile.email" />
    <nexa-toggle id="alerts" label="Alerts" [formField]="profile.alerts" />
  `,
})
class SignalFormsHost {
  readonly model = signal({ email: '', alerts: false });
  readonly profile = form(this.model, (fields) => required(fields.email));
}

describe('Nexa Signal Forms integrations', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [SignalFormsHost] }));

  it('binds value controls and checkbox controls without ControlValueAccessor', async () => {
    const fixture = TestBed.createComponent(SignalFormsHost);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('nexa-text-field input') as HTMLInputElement;
    input.value = 'buyer@nexa.test';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('buyer@nexa.test');
    expect(fixture.debugElement.query(By.directive(NexaTextField)).componentInstance.value()).toBe('buyer@nexa.test');
    (fixture.nativeElement.querySelector('nexa-toggle input') as HTMLInputElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.directive(NexaTextField)).componentInstance.value()).toBe('buyer@nexa.test');
    expect(fixture.debugElement.query(By.directive(NexaToggle)).componentInstance.checked()).toBe(true);
    expect(fixture.componentInstance.model()).toEqual({ email: 'buyer@nexa.test', alerts: true });
  });

  it('reports required state through the signal form field after blur', async () => {
    const fixture = TestBed.createComponent(SignalFormsHost);
    fixture.detectChanges();

    const input = fixture.nativeElement.querySelector('nexa-text-field input') as HTMLInputElement;
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.profile.email().invalid()).toBe(true);
  });
});
