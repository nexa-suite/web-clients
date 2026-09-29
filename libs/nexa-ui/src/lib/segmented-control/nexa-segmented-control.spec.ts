import { TestBed } from '@angular/core/testing';
import { NexaSegmentedControl } from './nexa-segmented-control';

describe('NexaSegmentedControl', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [NexaSegmentedControl] }));

  it('updates selection through user activation', () => {
    const fixture = TestBed.createComponent(NexaSegmentedControl);
    fixture.componentRef.setInput('label', 'View');
    fixture.componentRef.setInput('options', [{ value: 'list', label: 'List' }, { value: 'cards', label: 'Cards' }]);
    fixture.componentRef.setInput('selected', 'list');
    fixture.detectChanges();
    (fixture.nativeElement.querySelectorAll('button')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.componentInstance.selected()).toBe('cards');
  });
});
