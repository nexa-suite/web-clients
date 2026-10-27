export interface OrganizationRegistrationDraft {
  readonly registrationId: string;
  readonly status: string;
  readonly lastCompletedStep: number;
  readonly completedSteps: readonly number[];
  readonly data: Readonly<Record<string, Readonly<Record<string, unknown>>>>;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly resumeToken?: string | null;
}

export interface RegistrationSnapshot {
  readonly draft: OrganizationRegistrationDraft;
  readonly etag: string;
}
