import { TestBed } from '@angular/core/testing';
import { NexaLocaleSwitcher } from './nexa-locale-switcher';

describe('NexaLocaleSwitcher', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaLocaleSwitcher] }));

  it('uses the shared segmented control and updates the locale model', () => {
    const fixture = TestBed.createComponent(NexaLocaleSwitcher);
    fixture.detectChanges();

    (fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.componentInstance.locale()).toBe('es');
  });
});
