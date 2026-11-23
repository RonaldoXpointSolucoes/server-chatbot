export type FlowBlockCategory = 'Bubbles' | 'Inputs' | 'Condicionais' | 'Eventos';

export interface FlowBlockInstructions {
  summary: string;
  howToUse: string[];
  variables: string[];
  whatsappBehavior: string;
  bestPractices: string;
  testTips: string;
}

export interface FlowBlockSpec {
  type: string;
  label: string;
  category: FlowBlockCategory;
  supportsSimulator: boolean;
  supportsWhatsApp: boolean;
  instructions: FlowBlockInstructions;
}

export interface FlowExampleResult {
  title: string;
  description: string;
  triggerSuggestion: string;
  nodes: any[];
  edges: any[];
  focusGroupId: string;
}

export interface FlowHealthIssue {
  severity: 'error' | 'warning' | 'info';
  code: string;
  nodeId?: string;
  blockId?: string;
  message: string;
  suggestion: string;
}

export const FLOW_BLOCK_PALETTE: FlowBlockSpec[];

export function getFlowBlockSpec(type: string): FlowBlockSpec | undefined;

export function createDefaultBlockForType(type: string, labelOverride?: string): Record<string, any>;

export function buildBlockExampleFlow(
  type: string,
  options?: { existingNodes?: any[]; companyName?: string }
): FlowExampleResult;

export function analyzeFlowHealth(
  nodes: any[],
  edges: any[],
  context?: { currentFlowId?: string; triggerRules?: any[] }
): FlowHealthIssue[];
