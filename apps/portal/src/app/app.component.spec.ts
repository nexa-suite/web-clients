import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNexaHttp } from '@nexa/api';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('Portal app foundation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(routes),
        provideNexaHttp({ apiBaseUrl: '/api/v1', surface: 'PORTAL' }),
      ],
    }).compileComponents();
  });

  it('renders the application route outlet without a foundation demo page', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Product routes are not configured');
  });
});
