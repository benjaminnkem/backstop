/** BACKSTOP reference types. This is NOT an Agent-Native scaffold. */
export type Capability = 'access' | 'recovery' | 'administration';
export type Confidence = 'verified' | 'assumed' | 'unknown';
export type CapabilityMode = 'independent' | 'dependent' | 'unknown';
export type Status = 'available' | 'blocked' | 'at_risk' | 'unknown';
export type RequirementMode = 'ALL' | 'ANY';

export interface Resource {
  id: string;
  name: string;
  kind: string;
  criticality: 'critical' | 'high' | 'medium' | 'low';
  owner?: string;
}
export interface ResourceCapability {
  resourceId: string;
  capability: Capability;
  mode: CapabilityMode;
  confidence: Confidence;
}
export interface DependencyGroup {
  id: string;
  resourceId: string;
  capability: Capability;
  requirementMode: RequirementMode;
  label: string;
}
export interface DependencyLink {
  id: string;
  groupId: string;
  prerequisiteResourceId: string;
  prerequisiteCapability: Capability;
  confidence: Confidence;
}
export interface FailureSeed {
  resourceId: string;
  capability: Capability;
}
export interface GraphSnapshot {
  resources: Resource[];
  capabilities: ResourceCapability[];
  groups: DependencyGroup[];
  links: DependencyLink[];
}
export interface Impact {
  resourceId: string;
  capability: Capability;
  status: Status;
  reasons: string[];
}
export interface SimulationResult {
  impacts: Impact[];
  warnings: string[];
  summary: Record<Status, number>;
}
