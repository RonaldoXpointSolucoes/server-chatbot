export type ApiInstance = { id: string; assigned_node_id?: string | null };
export const PRODUCTION_API_URL: string;
export const ALPHA_API_URL: string;
export function instanceApiUrl(instance: ApiInstance, productionUrl?: string): string;
export function instanceApiEndpoint(instance: ApiInstance, kind?: 'text' | 'media', productionUrl?: string): string;
export function instanceApiSnippet(options: { instance: ApiInstance; kind?: 'text' | 'media'; language?: 'curl' | 'node'; apiKey?: string; number?: string; text?: string; mediatype?: string; productionUrl?: string }): string;
export function apiTestOutcome(httpStatus: number, payload?: any): { state: 'error' | 'queued' | 'accepted' | 'unconfirmed'; messageId: string | null; message: string };
export function redactApiResponse(value: any, apiKey?: string | null): string;
