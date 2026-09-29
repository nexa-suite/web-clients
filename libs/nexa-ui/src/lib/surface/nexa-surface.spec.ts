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
});
