import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { NexaApiError, type RegistrationSnapshot } from '@nexa/api';
import {
  OrganizationRegistrationPort, REGISTRATION_TERMS_PUBLICATION,
} from './organization-registration.port';

type PendingRegistrationCommand = Readonly<{
  step: number | 'submit';
  values: Readonly<Record<string, unknown>>;
  etag: string;
  key: string;
}>;

/** Resume authority and exact command retries live only in this browser session's memory. */
@Injectable()
export class OrganizationRegistrationStore {
  private readonly api = inject(OrganizationRegistrationPort);
  readonly terms = inject(REGISTRATION_TERMS_PUBLICATION);
  private resumeToken: string | null = null;
  private etag = '';
  private pending: PendingRegistrationCommand | null = null;
  private readonly snapshot = signal<RegistrationSnapshot | null>(null);
  readonly draft = computed(() => this.snapshot()?.draft ?? null);
  readonly busy = signal(false);
  readonly creationUnknown = signal(false);
  readonly accessUnavailable = signal(false);
  readonly stale = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  readonly unknownOutcome = signal(false);
  readonly step = signal(1);
  readonly editable = computed(() => this.draft()?.status === 'DRAFT' && !this.busy() && !this.unknownOutcome() && !this.stale());

  async create(): Promise<void> {
    if (this.busy() || this.draft() || this.creationUnknown() || this.accessUnavailable()) return;
    await this.run(async () => {
      const result = await firstValueFrom(this.api.create());
      if (!result.draft.resumeToken) throw new Error('Missing resume authority.');
      this.resumeToken = result.draft.resumeToken;
      this.accept(result);
      this.step.set(1);
      this.message.set('Borrador creado. Completa los datos de tu empresa.');
    }, false, true);
  }

  navigate(step: number): void {
    if (this.busy() || this.unknownOutcome()) return;
    const current = this.draft();
    if (current && step >= 1 && step <= Math.min(6, current.lastCompletedStep + 1)) {
      this.step.set(step);
      this.error.set('');
    }
  }

  async save(step: number, values: Readonly<Record<string, unknown>>): Promise<void> {
    if (!this.editable() || !this.resumeToken || this.pending) return;
    if (step === 6 && (!this.terms?.text || !this.terms.version ||
        values['termsVersion'] !== this.terms.version || values['termsAccepted'] !== true)) return;
    this.pending = Object.freeze({ step, values: Object.freeze({ ...values }), etag: this.etag, key: crypto.randomUUID() });
    await this.executePending();
  }

  async submit(): Promise<void> {
    const draft = this.draft();
    const accepted = draft?.data['step6'];
    if (!this.editable() || !this.resumeToken || this.pending || !this.terms?.text ||
        !this.terms.version || accepted?.['termsVersion'] !== this.terms.version ||
        accepted?.['termsAccepted'] !== true || draft?.lastCompletedStep !== 6) return;
    this.pending = Object.freeze({ step: 'submit', values: {}, etag: this.etag, key: crypto.randomUUID() });
    await this.executePending();
  }

  async retry(): Promise<void> {
    if (!this.busy() && this.pending) await this.executePending();
  }

  async refresh(): Promise<void> {
    const draft = this.draft();
    const token = this.resumeToken;
    if (!draft || !token || this.busy()) return;
    await this.run(async () => {
      this.accept(await firstValueFrom(this.api.read(draft.registrationId, token)));
      // A read cannot prove whether a pending step executed. Preserve its exact retry.
      if (this.draft()?.status !== 'DRAFT') {
        this.pending = null;
        this.unknownOutcome.set(false);
      }
      this.stale.set(false);
      this.message.set('Estado actualizado.');
    });
  }

  private async executePending(): Promise<void> {
    const pending = this.pending;
    const draft = this.draft();
    const token = this.resumeToken;
    if (!pending || !draft || !token || this.busy()) return;
    await this.run(async () => {
      const result = await firstValueFrom(pending.step === 'submit'
        ? this.api.submit(draft.registrationId, token, pending.etag, pending.key)
        : this.api.save(draft.registrationId, token, pending.step, pending.values, pending.etag, pending.key));
      this.accept(result);
      this.pending = null;
      this.unknownOutcome.set(false);
      if (pending.step !== 'submit') this.step.set(Math.min(6, pending.step + 1));
      this.message.set(pending.step === 'submit'
        ? 'Solicitud enviada. La activación requiere revisión de Nexa.'
        : 'Paso guardado. Puedes continuar o revisar tus datos.');
    }, true);
  }

  private accept(result: RegistrationSnapshot): void {
    this.etag = result.etag;
    // Credentials are never exposed through the signal read by presentation.
    this.snapshot.set({ ...result, draft: { ...result.draft, resumeToken: undefined } });
  }

  private async run(action: () => Promise<void>, command = false, creating = false): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
    } catch (cause) {
      const uncertain = !(cause instanceof NexaApiError) || ['network', 'timeout', 'server', 'unknown'].includes(cause.kind);
      if (creating && uncertain) {
        this.creationUnknown.set(true);
        this.error.set('No se confirmó la creación del borrador ni se recibió su acceso. No podemos recuperar ni repetir esta creación de forma segura desde esta página.');
      } else if (command && uncertain) {
        this.unknownOutcome.set(true);
        this.error.set('No se confirmó el resultado. Recupera el mismo envío antes de cambiar los datos.');
      } else {
        if (command) { this.pending = null; this.unknownOutcome.set(false); }
        const denied = cause instanceof NexaApiError &&
          ['not-found', 'forbidden', 'unauthenticated'].includes(cause.kind);
        if (denied && this.draft()) {
          this.snapshot.set(null);
          this.resumeToken = null;
          this.etag = '';
          this.pending = null;
          this.unknownOutcome.set(false);
          this.accessUnavailable.set(true);
        }
        const code = cause instanceof NexaApiError ? cause.problem?.code : null;
        const conflict = code === 'DRAFT_VERSION_CONFLICT' ||
          (cause instanceof NexaApiError && ['conflict', 'precondition'].includes(cause.kind));
        if (conflict) this.stale.set(true);
        this.error.set(conflict
          ? 'El borrador cambió. Actualiza el estado antes de volver a guardar.'
          : cause instanceof NexaApiError && ['not-found', 'forbidden', 'unauthenticated'].includes(cause.kind)
            ? 'No se pudo autorizar el acceso a este borrador.'
            : 'No se pudo completar la operación. Revisa los datos y vuelve a intentarlo.');
      }
    } finally {
      this.busy.set(false);
    }
  }
}
