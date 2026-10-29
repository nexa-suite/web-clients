import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type NexaLoadingSkeletonShape = 'rect' | 'rounded' | 'circle';

@Component({
  selector: 'nexa-loading-skeleton',
  templateUrl: './nexa-loading-skeleton.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nexa-loading-skeleton.scss',
  host: {
    role: 'status',
    '[attr.aria-label]': 'ariaLabel()',
  },
})
export class NexaLoadingSkeleton {
  readonly width = input<string | number | null>(null);
  readonly height = input<string | number | null>(null);
  readonly shape = input<NexaLoadingSkeletonShape>('rounded');
  readonly ariaLabel = input('Cargando contenido');

  private readonly resolvedCircleSize = computed(() =>
    this.toCssLength(this.width() ?? this.height(), '2.5rem'),
  );
  protected readonly resolvedWidth = computed(() =>
    this.shape() === 'circle'
      ? this.resolvedCircleSize()
      : this.toCssLength(this.width(), '100%'),
  );
  protected readonly resolvedHeight = computed(() =>
    this.shape() === 'circle'
      ? this.resolvedCircleSize()
      : this.toCssLength(this.height(), '1rem'),
  );

  private toCssLength(value: string | number | null, fallback: string): string {
    const resolved = value ?? fallback;
    return typeof resolved === 'number' ? `${resolved}px` : resolved;
  }
}
