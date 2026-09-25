import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  LogisticsOperationsDashboardResponse,
  NEXA_LOGISTICS_API_PATHS,
} from '../contracts/logistics.contracts';
import { NexaApiTransport } from '../http/nexa-api-transport';

/** Typed browser transport for current Logistics reads. */
@Injectable({ providedIn: 'root' })
export class NexaLogisticsApi {
  private readonly transport = inject(NexaApiTransport);

  getOperationsDashboard(): Observable<LogisticsOperationsDashboardResponse> {
    return this.transport.get<LogisticsOperationsDashboardResponse>(
      NEXA_LOGISTICS_API_PATHS.operationsDashboard,
    );
  }
}
