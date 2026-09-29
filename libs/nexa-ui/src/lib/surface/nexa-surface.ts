import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'nexa-surface',
  templateUrl: './nexa-surface.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nexa-surface.scss',
})
export class NexaSurface { readonly tone = input<'default' | 'soft' | 'inset'>('default'); }
