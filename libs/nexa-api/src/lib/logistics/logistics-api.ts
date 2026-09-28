import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  LogisticsOperationsDashboardResponse,
  NEXA_LOGISTICS_API_PATHS,
} from '../contracts/logistics.contracts';
import { NEXA_API_HTTP_CONFIGURATION } from '../http/nexa-http';

/** Typed browser transport for current Logistics reads. */
@Injectable({ providedIn: 'root' })
export class NexaLogisticsApi {
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(NEXA_API_HTTP_CONFIGURATION);

  getOperationsDashboard(): Observable<LogisticsOperationsDashboardResponse> {
    return this.http.get<LogisticsOperationsDashboardResponse>(
      this.url(NEXA_LOGISTICS_API_PATHS.operationsDashboard),
    );
  }

  private url(path: string): string {
    return `${this.configuration.apiBaseUrl}${path}`;
  }
}
