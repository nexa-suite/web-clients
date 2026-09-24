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

  it('provides the route outlet for Platform access and session routes', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.skip-link')?.getAttribute('href')).toBe('#main-content');
    expect(routes.some((route) => route.path === 'sign-in')).toBe(true);
  });
});
