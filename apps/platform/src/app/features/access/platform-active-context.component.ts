import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NexaSurface } from 'nexa-ui';
import { PlatformSessionStore } from '../../core/platform-session.store';
import { presentApiRoles } from './platform-role-presentation';

type CollectionPresentation<T> =
  | { readonly status: 'not-supplied' }
  | { readonly status: 'empty' }
  | { readonly status: 'provided'; readonly values: readonly T[] };

@Component({
  selector: 'platform-active-context',
  standalone: true,
  imports: [NexaSurface],
  templateUrl: './platform-active-context.component.html',
  styleUrl: './platform-active-context.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlatformActiveContextComponent {
  private readonly sessionStore = inject(PlatformSessionStore);

  readonly session = computed(() => {
    const state = this.sessionStore.state();
    return state.status === 'authenticated' ? state.session : null;
  });

  readonly apiRoles = computed<CollectionPresentation<ReturnType<typeof presentApiRoles>[number]>>(() => {
    const roles = this.session()?.membership?.roles;
    if (roles === undefined) return { status: 'not-supplied' };
    if (roles.length === 0) return { status: 'empty' };
    return { status: 'provided', values: presentApiRoles(roles) };
  });

  readonly apiPermissions = computed<CollectionPresentation<string>>(() => {
    const permissions = this.session()?.membership?.permissions;
    if (permissions === undefined) return { status: 'not-supplied' };
    if (permissions.length === 0) return { status: 'empty' };
    return { status: 'provided', values: permissions };
  });

  apiValue(value: string | null | undefined): string {
    return value?.trim() || 'Not supplied by the API';
  }
}
