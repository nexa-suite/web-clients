import { TestBed } from '@angular/core/testing';
import { NexaSurface } from './nexa-surface';

describe('NexaSurface', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaSurface] }));

  it('renders the requested surface tone without changing its boundary', () => {
    const fixture = TestBed.createComponent(NexaSurface);
    fixture.componentRef.setInput('tone', 'inset');
    fixture.detectChanges();

    const surface = fixture.nativeElement.querySelector('.nexa-surface') as HTMLElement;
    expect(surface.classList.contains('inset')).toBe(true);
  });

  it('uses a host padding token without imposing a default', () => {
    const fixture = TestBed.createComponent(NexaSurface);
    fixture.nativeElement.style.setProperty('--nexa-surface-padding', '20px');
    fixture.detectChanges();

    const surface = fixture.nativeElement.querySelector('.nexa-surface') as HTMLElement;
    expect(fixture.nativeElement.style.getPropertyValue('--nexa-surface-padding')).toBe('20px');
    expect(getComputedStyle(surface).padding).toBe('var(--nexa-surface-padding, 0)');
  });
});
