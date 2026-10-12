export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  properties?: Readonly<Record<string, unknown>>;
}

export interface NexaProblemDetail extends ProblemDetail {
  code: string;
  correlationId: string;
  category: string;
  retryable: boolean;
  traceId?: string;
  errors?: readonly Readonly<Record<string, unknown>>[];
}

export interface ApiProblemDetails extends ProblemDetail {
  code?: string;
  correlationId?: string;
  category?: string;
  retryable?: boolean;
  traceId?: string;
  errors?: readonly Readonly<Record<string, unknown>>[];
}
