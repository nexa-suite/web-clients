import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import type { WorkspacePreviewResponse } from '@nexa/api';
import { Subject } from 'rxjs';
import { PlatformSessionStore, type PlatformSessionState } from '../../core/platform-session.store';
import { SignInPageComponent } from './sign-in-page.component';

describe('SignInPageComponent', () => {
  let previewRequests: Subject<WorkspacePreviewResponse>[];
  let previewWorkspace: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    previewRequests = [];
    previewWorkspace = vi.fn(() => {
      const request = new Subject<WorkspacePreviewResponse>();
      previewRequests.push(request);
      return request.asObservable();
    });

    await TestBed.configureTestingModule({
      imports: [SignInPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: PlatformSessionStore,
          useValue: {
            state: signal<PlatformSessionState>({ status: 'unauthenticated' }),
            previewWorkspace,
          },
        },
      ],
    }).compileComponents();
  });

  it('ignores a stale workspace preview after a newer slug has been checked', () => {
    const fixture = TestBed.createComponent(SignInPageComponent);
    const component = fixture.componentInstance;

    component.setWorkspaceSlug('older-workspace');
    component.previewWorkspace();
    component.setWorkspaceSlug('current-workspace');
    component.previewWorkspace();

    const currentPreview: WorkspacePreviewResponse = {
      recognized: true,
      loginAvailable: true,
      displayName: 'Current Workspace',
    };
    previewRequests[1].next(currentPreview);
    previewRequests[0].next({
      recognized: true,
      loginAvailable: true,
      displayName: 'Older Workspace',
    });

    expect(previewWorkspace).toHaveBeenCalledTimes(2);
    expect(component.preview()).toEqual(currentPreview);
    expect(component.previewedSlug()).toBe('current-workspace');
    expect(component.canSignIn()).toBe(true);
    expect(component.previewing()).toBe(false);
  });
});
