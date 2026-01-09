export interface Location {
  region: string;
  country: string;
  city?: string;
  availableNodes: number;
  averageLoad: number;
}
