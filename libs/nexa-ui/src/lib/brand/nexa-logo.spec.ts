import { TestBed } from '@angular/core/testing';
import { NexaLogo } from './nexa-logo';

describe('NexaLogo', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaLogo] }));

  it('keeps brand source and accessible naming explicit', () => {
    const fixture = TestBed.createComponent(NexaLogo);
    fixture.componentRef.setInput('alt', 'Nexa workspace');
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.alt).toBe('Nexa workspace');
    expect(image.src).toContain('/brand/canonical/logo-nexa.svg');
  });
});
