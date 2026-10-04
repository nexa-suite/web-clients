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

  it('resolves brand assets through the document base path', () => {
    const originalBase = document.querySelector('base');
    const base = document.createElement('base');
    base.href = '/web-clients/';
    if (originalBase) originalBase.replaceWith(base);
    else document.head.prepend(base);

    const fixture = TestBed.createComponent(NexaLogo);
    fixture.detectChanges();

    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.src).toContain('/web-clients/brand/canonical/logo-nexa.svg');

    if (originalBase) base.replaceWith(originalBase);
    else base.remove();
  });
});
