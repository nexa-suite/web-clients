import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PortalSessionStore } from './portal-session.store';
import { AccessPageComponent } from './access-page.component';

describe('AccessPageComponent', () => {
  it('requires a preview of the exact workspace before showing sign-in fields', async () => {
    const previewState = signal<'idle' | 'checking' | 'recognized' | 'unavailable' | 'error'>('idle');
    const preview = signal<{ recognized?: boolean; displayName?: string } | null>(null);
    const session = {
      workspacePreviewState: previewState.asReadonly(),
      workspacePreview: preview.asReadonly(),
      busy: signal(false).asReadonly(),
      signOutError: signal('').asReadonly(),
      previewWorkspace: vi.fn(async (slug: string) => {
        previewState.set('recognized');
        preview.set({ recognized: true, displayName: 'Workspace' });
        return slug === 'workspace-a';
      }),
    };
    await TestBed.configureTestingModule({
      imports: [AccessPageComponent],
      providers: [provideRouter([]), { provide: PortalSessionStore, useValue: session }],
    }).compileComponents();

    const fixture = TestBed.createComponent(AccessPageComponent);
    fixture.detectChanges();
    const workspaceInput = fixture.nativeElement.querySelector('nexa-text-field input') as HTMLInputElement;
    workspaceInput.value = 'workspace-a';
    workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('form button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('nexa-text-field input[type="email"]')).not.toBeNull();
    workspaceInput.value = 'workspace-b';
    workspaceInput.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('nexa-text-field input[type="email"]')).toBeNull();
    expect(session.previewWorkspace).toHaveBeenCalledWith('workspace-a');
  });
});
