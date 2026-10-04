import { TestBed } from '@angular/core/testing';
import { NexaApiError, NexaAuthenticationApi } from '@nexa/api';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { RecoveryPageComponent } from './recovery-page.component';

describe('RecoveryPageComponent', () => {
  let requestPasswordReset: ReturnType<typeof vi.fn>;
  let resetPassword: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/web-clients/reset-password');
    requestPasswordReset = vi.fn(() => of({
      message: 'If the account can receive a reset, instructions will be delivered.',
    }));
    resetPassword = vi.fn(() => of(undefined));
    TestBed.configureTestingModule({
      imports: [RecoveryPageComponent],
      providers: [
        provideRouter([]),
        {
          provide: NexaAuthenticationApi,
          useValue: { requestPasswordReset, resetPassword },
        },
      ],
    });
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/web-clients/reset-password');
  });

  it('accepts a token only from the fragment and removes it from the address bar', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=opaque-fragment-token');

    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;

    expect(component.mode()).toBe('reset');
    expect(window.location.hash).toBe('');
    expect(window.location.href).not.toContain('opaque-fragment-token');
  });

  it('captures query-string tokens in memory and removes them before the form is shown', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password?token=leaked-query-token');

    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;

    expect(component.mode()).toBe('reset');
    expect(window.location.search).toBe('');
    expect(window.location.href).not.toContain('leaked-query-token');
  });

  it('uses a generic request response and keeps the recovery surface internal', () => {
    window.history.replaceState(null, '', '/web-clients/forgot-password');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.email.set('owner@example.test');

    component.submitRequest(new Event('submit') as SubmitEvent);

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'owner@example.test',
      surface: 'PLATFORM',
    });
    expect(component.statusMessage()).toBe(
      'If the account can receive a reset, instructions will be delivered.',
    );
    expect(component.statusMessage()).not.toContain('owner@example.test');
  });

  it('keeps request failures generic so account existence is not disclosed', () => {
    window.history.replaceState(null, '', '/web-clients/forgot-password');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.email.set('unknown@example.test');
    requestPasswordReset.mockReturnValueOnce(throwError(() => new Error('internal account detail')));

    component.submitRequest(new Event('submit') as SubmitEvent);

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'unknown@example.test',
      surface: 'PLATFORM',
    });
    expect(component.statusMessage()).toBe(
      'If the account can receive a reset, instructions will be delivered.',
    );
    expect(component.errorMessage()).toBe('');
    expect(component.statusMessage()).not.toContain('unknown@example.test');
    expect(component.statusMessage()).not.toContain('internal account detail');
  });

  it('shows an invalid state and makes no mutation when the reset token is missing', () => {
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;

    expect(component.mode()).toBe('invalid');
    expect(component.statusMessage()).toBe('The reset link is invalid or no longer available.');
    component.submitReset(new Event('submit') as SubmitEvent);

    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('keeps the optional request route separate from token consumption', () => {
    window.history.replaceState(null, '', '/web-clients/forgot-password');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;

    expect(component.mode()).toBe('request');
    component.email.set('owner@example.test');
    component.submitRequest(new Event('submit') as SubmitEvent);

    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: 'owner@example.test',
      surface: 'PLATFORM',
    });
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it('submits the in-memory fragment token once and clears it after success', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=one-time-token');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.newPassword.set('a-strong-password-123');
    component.confirmation.set('a-strong-password-123');

    component.submitReset(new Event('submit') as SubmitEvent);

    expect(resetPassword).toHaveBeenCalledWith({
      token: 'one-time-token',
      newPassword: 'a-strong-password-123',
    });
    expect(component.mode()).toBe('complete');
    expect(window.location.href).not.toContain('one-time-token');
  });

  it('renders a sign-in destination after a successful reset', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=one-time-token');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.newPassword.set('a-strong-password-123');
    component.confirmation.set('a-strong-password-123');

    component.submitReset(new Event('submit') as SubmitEvent);
    fixture.detectChanges();

    const signInLink = fixture.nativeElement.querySelector('a[href="/sign-in"]');
    expect(signInLink).not.toBeNull();
  });

  it('rejects too-short, too-long, and mismatched passwords before mutation', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=validation-token');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;

    component.newPassword.set('a'.repeat(11));
    component.confirmation.set('a'.repeat(11));
    component.submitReset(new Event('submit') as SubmitEvent);
    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Use at least 12 characters.');

    component.newPassword.set('a'.repeat(129));
    component.confirmation.set('a'.repeat(129));
    component.submitReset(new Event('submit') as SubmitEvent);
    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Use no more than 128 characters.');

    component.newPassword.set('a-strong-password-123');
    component.confirmation.set('a-different-password-123');
    component.submitReset(new Event('submit') as SubmitEvent);
    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Passwords must match.');
  });

  it('rejects empty password fields before mutation', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=empty-token');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;

    component.submitReset(new Event('submit') as SubmitEvent);
    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Enter a new password.');

    component.newPassword.set('a-strong-password-123');
    component.submitReset(new Event('submit') as SubmitEvent);
    expect(resetPassword).not.toHaveBeenCalled();
    expect(component.errorMessage()).toBe('Confirm your new password.');
  });

  it('does not submit a second reset while the first request is pending', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=pending-token');
    const pending = new Subject<void>();
    resetPassword.mockReturnValueOnce(pending.asObservable());
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.newPassword.set('a-strong-password-123');
    component.confirmation.set('a-strong-password-123');

    component.submitReset(new Event('submit') as SubmitEvent);
    component.submitReset(new Event('submit') as SubmitEvent);

    expect(resetPassword).toHaveBeenCalledTimes(1);
    pending.complete();
  });

  it('does not expose server token errors or accept a failed one-time use', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=already-used-token');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.newPassword.set('a-strong-password-123');
    component.confirmation.set('a-strong-password-123');
    resetPassword.mockReturnValueOnce(
      throwError(() => new NexaApiError('validation', 400, null)),
    );

    component.submitReset(new Event('submit') as SubmitEvent);

    expect(resetPassword).toHaveBeenCalledWith({
      token: 'already-used-token',
      newPassword: 'a-strong-password-123',
    });
    expect(component.mode()).toBe('reset');
    expect(component.errorMessage()).toBe('The reset link is invalid or no longer available.');
  });

  it('maps network failures to a safe retry message', () => {
    window.history.replaceState(null, '', '/web-clients/reset-password#token=network-token');
    const fixture = TestBed.createComponent(RecoveryPageComponent);
    const component = fixture.componentInstance;
    component.newPassword.set('a-strong-password-123');
    component.confirmation.set('a-strong-password-123');
    resetPassword.mockReturnValueOnce(
      throwError(() => new NexaApiError('network', 0, null)),
    );

    component.submitReset(new Event('submit') as SubmitEvent);

    expect(component.mode()).toBe('reset');
    expect(component.errorMessage()).toBe(
      'The API could not be reached. Check your connection and try again.',
    );
  });
});
