import { TestBed } from '@angular/core/testing';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { NexaLogisticsApi } from './logistics-api';
import { provideNexaHttp } from '../http/nexa-http';

describe('NexaLogisticsApi', () => {
  let api: NexaLogisticsApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNexaHttp({
          apiBaseUrl: 'https://api.example.test/api/v1',
          surface: 'PLATFORM',
        }),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(NexaLogisticsApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses the shared browser transport for the current-context operations read', () => {
    let received: unknown;
    api.getOperationsDashboard().subscribe((value) => (received = value));

    const request = http.expectOne('https://api.example.test/api/v1/logistics/operations-dashboard');
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Nexa-Surface')).toBeNull();
    expect(request.request.headers.get('X-Nexa-Client')).toBeNull();
    expect(request.request.withCredentials).toBe(false);
    request.flush({ readyForOperations: 0 });

    expect(received).toEqual({ readyForOperations: 0 });
  });
});
