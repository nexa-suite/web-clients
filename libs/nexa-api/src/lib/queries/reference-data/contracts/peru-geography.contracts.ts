/** Reference options returned by the Platform Peru geography endpoints. */
export interface PeruGeographyOption {
  readonly id: number;
  readonly code: string;
  readonly label: string;
  readonly parentCode: string | null;
  readonly active: boolean;
}
