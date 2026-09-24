import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { PortalShellComponent } from './portal-shell.component';
import { PortalSessionStore } from '../features/access/portal-session.store';

@Component({ standalone: true, template: '' })
class TestCatalogRouteComponent {}

describe('PortalShellComponent', () => {
  it('provides a skip link and exposes the active catalog route to assistive technology', async () => {
    const session = {
      buyerAccount: signal({ businessName: 'Buyer account' }).asReadonly(),
      session: signal({ user: { displayName: 'Buyer contact' } }).asReadonly(),
      signOutError: signal('').asReadonly(),
      signOut: vi.fn().mockResolvedValue(true),
    };
    await TestBed.configureTestingModule({
      imports: [PortalShellComponent],
      providers: [
        provideRouter([{ path: 'catalog', component: TestCatalogRouteComponent }]),
        { provide: PortalSessionStore, useValue: session },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(PortalShellComponent);
    const router = TestBed.inject(Router);
    fixture.detectChanges();
    await router.navigateByUrl('/catalog');
    fixture.detectChanges();

    const skipLink = fixture.nativeElement.querySelector('.skip-link') as HTMLAnchorElement;
    const catalogLink = fixture.nativeElement.querySelector('.buyer-navigation a') as HTMLAnchorElement;
    const mainContent = fixture.nativeElement.querySelector('#main-content') as HTMLElement;
    expect(skipLink.getAttribute('href')).toBe('#main-content');
    skipLink.click();
    expect(document.activeElement).toBe(mainContent);
    expect(catalogLink.getAttribute('aria-current')).toBe('page');
  });
});
