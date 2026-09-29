import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { SessionResponse } from '@nexa/api';
import { PlatformShellComponent } from './platform-shell.component';

describe('PlatformShellComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlatformShellComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders neutral shell chrome and an authenticated route outlet without session claims', () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nexa Platform');
    expect(fixture.nativeElement.querySelector('nexa-logo')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('nexa-button')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Active business context');
  });

  it('renders only the identity and business context returned by the session', () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    const session: SessionResponse = {
      user: { displayName: 'Alex Rivera', email: 'alex@example.test' },
      tenant: { tenantSlug: 'north-distribution' },
      workspace: { workspaceSlug: 'main' },
    };
    fixture.componentRef.setInput('session', session);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Alex Rivera');
    expect(fixture.nativeElement.textContent).toContain('Active business context');
    expect(fixture.nativeElement.textContent).toContain('Tenant: north-distribution');
    expect(fixture.nativeElement.textContent).toContain('Workspace: main');
    expect(fixture.nativeElement.querySelector('nav[aria-label="Platform navigation"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('nexa-button')?.textContent).toContain('Sign out');
  });

  it('uses server session names for the active business context when present', () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput('session', {
      tenant: { tenantName: 'North Distribution', tenantSlug: 'north-distribution' },
      workspace: { workspaceName: 'Main Warehouse', workspaceSlug: 'main' },
    } satisfies SessionResponse);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Tenant: North Distribution (north-distribution)');
    expect(fixture.nativeElement.textContent).toContain('Workspace: Main Warehouse (main)');
  });

  it('shows the operational overview link only for an API-returned supported read permission', () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput('session', {
      membership: { roles: ['LOGISTICS'] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[routerLink="/operations/overview"]')).toBeNull();

    fixture.componentRef.setInput('session', {
      membership: { permissions: ['dispatch.read'] },
    } satisfies SessionResponse);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('a[routerLink="/operations/overview"]')?.textContent).toContain('Operations overview');
  });

  it('uses the returned email when the session has no display name', () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput('session', {
      user: { email: 'alex@example.test' },
    } satisfies SessionResponse);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('alex@example.test');
  });

  it('emits sign out without applying session or authorization behavior', () => {
    const fixture = TestBed.createComponent(PlatformShellComponent);
    fixture.componentRef.setInput('session', { user: { displayName: 'Alex Rivera' } } satisfies SessionResponse);
    const signOut = vi.fn();
    fixture.componentInstance.signOut.subscribe(signOut);
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector('nexa-button button') as HTMLButtonElement;
    button.click();

    expect(signOut).toHaveBeenCalledOnce();
  });
});
