import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'platform-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent {
  private readonly document = inject(DOCUMENT);

  focusMainContent(): void {
    const focusContent = () => this.document.getElementById('main-content')?.focus();
    this.document.defaultView?.requestAnimationFrame(focusContent) ?? focusContent();
  }
}
