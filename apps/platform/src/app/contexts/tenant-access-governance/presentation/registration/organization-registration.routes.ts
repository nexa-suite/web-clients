import { Routes } from '@angular/router';
import { OrganizationRegistrationPort } from '../../application/organization-registration.port';
import { OrganizationRegistrationStore } from '../../application/organization-registration.store';
import { NexaOrganizationRegistrationApi } from '@nexa/api';
import { OrganizationRegistrationPageComponent } from './organization-registration-page.component';

export const PLATFORM_ORGANIZATION_REGISTRATION_ROUTES: Routes = [{
  path: 'register',
  component: OrganizationRegistrationPageComponent,
  title: 'Registrar empresa | Nexa',
  providers: [
    OrganizationRegistrationStore,
    { provide: OrganizationRegistrationPort, useExisting: NexaOrganizationRegistrationApi },
  ],
}];
