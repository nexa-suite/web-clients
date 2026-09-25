/** Exact read projection returned by GET /logistics/operations-dashboard. */
export interface LogisticsOperationsDashboardResponse {
  readyForOperations: number;
  preparing: number;
  assigned: number;
  scheduled: number;
  readyForRoute: number;
  inRoute: number;
  incidents: number;
  deliveredToday: number;
  temperatureAlerts: number;
  podPending: number;
  reservationsReady: number;
}

export const NEXA_LOGISTICS_API_PATHS = {
  operationsDashboard: '/logistics/operations-dashboard',
} as const;
