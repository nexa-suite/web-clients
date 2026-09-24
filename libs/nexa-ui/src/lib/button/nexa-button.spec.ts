import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NexaButton } from './nexa-button';

describe('NexaButton', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaButton], providers: [provideRouter([])] }));

  it('keeps a loading button disabled and truthful', () => {
    const fixture = TestBed.createComponent(NexaButton);
    fixture.componentRef.setInput('loading', true);
    fixture.componentRef.setInput('variant', 'secondary');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.querySelector('.spinner')).toBeTruthy();
  });

  it('forwards an accessible name to the native action', () => {
    const fixture = TestBed.createComponent(NexaButton);
    fixture.componentRef.setInput('ariaLabel', 'Open request actions');
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Open request actions');
  });

  it('does not navigate when a router link is disabled or loading', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    const fixture = TestBed.createComponent(NexaButton);
    fixture.componentRef.setInput('routerLink', '/blocked-target');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(link.getAttribute('aria-disabled')).toBe('true');
    expect(link.getAttribute('href')).toBeNull();
    link.click();
    await fixture.whenStable();
    expect(router.url).toBe('/');
  });

  it('blocks keyboard activation of a disabled link-style action', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    const fixture = TestBed.createComponent(NexaButton);
    fixture.componentRef.setInput('routerLink', '/keyboard-blocked');
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const link = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    link.dispatchEvent(enter);
    link.dispatchEvent(space);
    await fixture.whenStable();

    expect(enter.defaultPrevented).toBe(true);
    expect(space.defaultPrevented).toBe(true);
    expect(router.url).toBe('/');
  });
});
