import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { NexaApiError, NexaLogisticsApi } from '@nexa/api';
import { of, throwError } from 'rxjs';
import { PlatformSessionStore } from '../../core/platform-session.store';
import { PlatformOperationsOverviewComponent } from './operations-overview.component';

@Component({ standalone: true, template: '<p>Sign in route</p>' })
class SignInRouteStubComponent {}

describe('PlatformOperationsOverviewComponent', () => {
  const response = {
    readyForOperations: 1,
    preparing: 2,
    assigned: 3,
    scheduled: 4,
    readyForRoute: 5,
    inRoute: 6,
    incidents: 7,
    deliveredToday: 8,
    temperatureAlerts: 9,
    podPending: 10,
    reservationsReady: 11,
  };
  let getOperationsDashboard: ReturnType<typeof vi.fn>;
  let expireLocalSession: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getOperationsDashboard = vi.fn(() => of(response));
    expireLocalSession = vi.fn();
    await TestBed.configureTestingModule({
      imports: [PlatformOperationsOverviewComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'sign-in', component: SignInRouteStubComponent }]),
        { provide: NexaLogisticsApi, useValue: { getOperationsDashboard } },
        { provide: PlatformSessionStore, useValue: { expireLocalSession } },
      ],
    }).compileComponents();
  });

  it('loads the server metrics as a read-only presentation projection', () => {
    const fixture = TestBed.createComponent(PlatformOperationsOverviewComponent);
    fixture.detectChanges();

    expect(getOperationsDashboard).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Operations overview');
    expect(fixture.nativeElement.textContent).toContain('Ready for operations');
    expect(fixture.nativeElement.textContent).toContain('Proof of delivery pending');
    expect(fixture.nativeElement.textContent).toContain('11');
    expect(fixture.nativeElement.querySelectorAll('.operations-overview__metric')).toHaveLength(11);
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(1);
  });

  it('shows a forbidden state without exposing server detail', () => {
    getOperationsDashboard.mockReturnValueOnce(throwError(() => new NexaApiError(
      'forbidden',
      403,
      { detail: 'permission role internals must not reach the page' },
    )));
    const fixture = TestBed.createComponent(PlatformOperationsOverviewComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('not available for the current business context');
    expect(fixture.nativeElement.textContent).not.toContain('permission role internals');
    expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('button')).toHaveLength(0);
  });

  it('clears local authority and redirects to sign-in after an unauthorized read', async () => {
    getOperationsDashboard.mockReturnValueOnce(throwError(() => new NexaApiError(
      'unauthenticated',
      401,
      { detail: 'expired bearer' },
    )));
    const fixture = TestBed.createComponent(PlatformOperationsOverviewComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(expireLocalSession).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toContain('/sign-in');
    expect(fixture.nativeElement.textContent).not.toContain('expired bearer');
  });

  it('retries only the safe dashboard read after a recoverable failure', () => {
    getOperationsDashboard
      .mockReturnValueOnce(throwError(() => new NexaApiError('network', 0, null)))
      .mockReturnValueOnce(of(response));
    const fixture = TestBed.createComponent(PlatformOperationsOverviewComponent);
    fixture.detectChanges();
    const retry = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();

    expect(getOperationsDashboard).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelectorAll('.operations-overview__metric')).toHaveLength(11);
  });
});
