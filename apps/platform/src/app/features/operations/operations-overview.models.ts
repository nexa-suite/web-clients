import type { LogisticsOperationsDashboardResponse } from '@nexa/api';

export interface OperationsMetricViewModel {
  readonly id: keyof LogisticsOperationsDashboardResponse;
  readonly label: string;
  readonly value: number;
}

const metricDefinitions: readonly Pick<OperationsMetricViewModel, 'id' | 'label'>[] = [
  { id: 'readyForOperations', label: 'Ready for operations' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'readyForRoute', label: 'Ready for route' },
  { id: 'inRoute', label: 'In route' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'deliveredToday', label: 'Delivered today' },
  { id: 'temperatureAlerts', label: 'Temperature alerts' },
  { id: 'podPending', label: 'Proof of delivery pending' },
  { id: 'reservationsReady', label: 'Reservations ready' },
];

/** Translates the transport response into the view's fixed, read-only metric set. */
export function toOperationsMetricViewModels(
  response: LogisticsOperationsDashboardResponse,
): readonly OperationsMetricViewModel[] {
  return metricDefinitions.map(({ id, label }) => {
    const value = response?.[id];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error('The operational overview response is incomplete.');
    }
    return { id, label, value };
  });
}
