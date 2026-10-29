import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NexaButton, NexaLogo, NexaStatusChip, NexaTextField } from 'nexa-ui';
import { OrganizationRegistrationStore } from '../../application/organization-registration.store';

interface RegistrationField {
  readonly key: string;
  readonly label: string;
  readonly type?: 'text' | 'email';
  readonly helper?: string;
  readonly optional?: boolean;
  readonly options?: readonly { value: string; label: string }[];
}

const STEPS: readonly { title: string; description: string; fields: readonly RegistrationField[] }[] = [
  { title: 'Empresa', description: 'Identifica la empresa que solicita incorporarse a Nexa.', fields: [
    { key: 'legalName', label: 'Razón social' },
    { key: 'displayName', label: 'Nombre comercial' },
    { key: 'businessIdentifier', label: 'Identificador fiscal', optional: true, helper: 'Opcional. Usa el identificador correspondiente a tu empresa.' },
  ] },
  { title: 'Espacio de trabajo', description: 'Indica el espacio de trabajo y su almacén inicial.', fields: [
    { key: 'workspaceName', label: 'Nombre del espacio' },
    { key: 'workspaceSlug', label: 'Identificador del espacio', helper: 'De 3 a 80 letras, números o guiones. Se utilizará para acceder al espacio.' },
    { key: 'storageSiteName', label: 'Nombre del almacén' },
    { key: 'storageSiteAddress', label: 'Dirección del almacén' },
  ] },
  { title: 'Operación', description: 'Selecciona la actividad que describe tu operación.', fields: [
    { key: 'operationCategory', label: 'Tipo de operación', options: [
      { value: 'b2bColdChainDistributor', label: 'Distribución B2B con cadena de frío' },
      { value: 'refrigeratedWarehouseOperator', label: 'Operación de almacén refrigerado' },
      { value: 'foodServiceSupplier', label: 'Suministro para servicios de alimentación' },
      { value: 'thirdPartyColdStorage', label: 'Almacenamiento en frío para terceros' },
    ] },
  ] },
  { title: 'Cuenta fundadora', description: 'Persona responsable de solicitar el alta. La cuenta se habilita tras la activación.', fields: [
    { key: 'founderDisplayName', label: 'Nombre completo' },
    { key: 'founderEmail', label: 'Correo de trabajo', type: 'email', helper: 'Tras la activación, Nexa enviará indicaciones para establecer la contraseña.' },
  ] },
  { title: 'Plan de referencia', description: 'Esta preferencia no contrata una suscripción ni inicia un cobro.', fields: [
    { key: 'referencePlan', label: 'Plan de referencia', options: ['Starter', 'Standard', 'Professional', 'Enterprise'].map(value => ({ value, label: value })) },
  ] },
  { title: 'Revisión y envío', description: 'Revisa los datos guardados antes de solicitar la activación.', fields: [] },
];

@Component({
  selector: 'platform-organization-registration-page',
  imports: [RouterLink, NexaButton, NexaLogo, NexaStatusChip, NexaTextField],
  templateUrl: './organization-registration-page.component.html',
  styleUrl: './organization-registration-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrganizationRegistrationPageComponent {
  readonly store = inject(OrganizationRegistrationStore);
  readonly steps = STEPS;
  readonly current = computed(() => STEPS[this.store.step() - 1]);
  readonly values = signal<Record<string, string>>({});
  readonly validation = signal('');
  readonly termsAccepted = signal(false);
  readonly hasAcceptedCurrentTerms = computed(() => {
    const accepted = this.store.draft()?.data['step6'];
    return !!this.store.terms?.text && !!this.store.terms.version &&
      accepted?.['termsVersion'] === this.store.terms.version && accepted?.['termsAccepted'] === true;
  });
  readonly statusLabel = computed(() => {
    switch (this.store.draft()?.status) {
      case 'DRAFT': return 'Borrador';
      case 'PENDING_ACTIVATION': return 'Pendiente de activación';
      case 'ACTIVE': return 'Activada';
      case 'REJECTED': return 'Solicitud rechazada';
      default: return 'Estado recibido';
    }
  });

  constructor() {
    effect(() => {
      const step = this.store.step();
      const saved = this.store.draft()?.data[`step${step}`] ?? {};
      const values: Record<string, string> = {};
      for (const field of STEPS[step - 1].fields) values[field.key] = String(saved[field.key] ?? '');
      this.values.set(values);
      this.validation.set('');
      this.termsAccepted.set(false);
    });
  }

  setValue(key: string, value: string): void {
    this.values.update(values => ({ ...values, [key]: value }));
    this.validation.set('');
  }

  choose(key: string, event: Event): void {
    if (event.target instanceof HTMLSelectElement) this.setValue(key, event.target.value);
  }

  toggleTerms(event: Event): void {
    if (event.target instanceof HTMLInputElement) this.termsAccepted.set(event.target.checked);
  }

  save(event: Event): void {
    event.preventDefault();
    const fields = this.current().fields;
    const values = Object.fromEntries(Object.entries(this.values()).map(([key, value]) => [key, value.trim()]));
    if (fields.some(field => !field.optional && !values[field.key])) {
      this.validation.set('Completa los campos obligatorios antes de guardar.');
      return;
    }
    if (this.store.step() === 2 && !/^[A-Za-z0-9-]{3,80}$/.test(values['workspaceSlug'])) {
      this.validation.set('El identificador requiere entre 3 y 80 letras, números o guiones.');
      return;
    }
    if (this.store.step() === 4 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values['founderEmail'])) {
      this.validation.set('Introduce un correo válido para la cuenta fundadora.');
      return;
    }
    void this.store.save(this.store.step(), values);
  }

  saveTerms(): void {
    if (!this.termsAccepted() || !this.store.terms) return;
    void this.store.save(6, { termsVersion: this.store.terms.version, termsAccepted: true });
  }

  savedValue(step: number, field: RegistrationField): string {
    const value = String(this.store.draft()?.data[`step${step}`]?.[field.key] ?? '');
    return field.options?.find(option => option.value === value)?.label ?? value;
  }
}
