import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideNexaHttp } from '@nexa/api';
import { AppComponent } from './app.component';
import { routes } from './app.routes';

describe('Platform app foundation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter(routes),
        provideNexaHttp({ apiBaseUrl: '/api/v1', surface: 'PLATFORM' }),
      ],
    }).compileComponents();
  });

  it('renders a neutral landing page with a router outlet', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Nexa Platform');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
