import type { LogisticsOperationsDashboardResponse } from '@nexa/api';
import { toOperationsMetricViewModels } from './operations-overview.models';

describe('toOperationsMetricViewModels', () => {
  const response: LogisticsOperationsDashboardResponse = {
    readyForOperations: 1,
    preparing: 2,
    assigned: 3,
    scheduled: 4,
    readyForRoute: 5,
    inRoute: 6,
    incidents: 7,
    deliveredToday: 8,
    temperatureAlerts: 9,
    podPending: 10,
    reservationsReady: 11,
  };

  it('maps server-owned values to a fixed presentation projection without deriving totals', () => {
    const metrics = toOperationsMetricViewModels(response);

    expect(metrics.map(({ id }) => id)).toEqual([
      'readyForOperations',
      'preparing',
      'assigned',
      'scheduled',
      'readyForRoute',
      'inRoute',
      'incidents',
      'deliveredToday',
      'temperatureAlerts',
      'podPending',
      'reservationsReady',
    ]);
    expect(metrics.map(({ value }) => value)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('preserves zero values and rejects incomplete or invalid count responses', () => {
    expect(toOperationsMetricViewModels({
      ...response,
      readyForOperations: 0,
    }).at(0)?.value).toBe(0);

    expect(() => toOperationsMetricViewModels({
      ...response,
      incidents: -1,
    })).toThrow('The operational overview response is incomplete.');
    expect(() => toOperationsMetricViewModels({
      ...response,
      preparing: Number.NaN,
    })).toThrow('The operational overview response is incomplete.');
  });
});
