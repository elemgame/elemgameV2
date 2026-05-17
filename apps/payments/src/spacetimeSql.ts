import type { SpacetimeAdminConfig } from './config.js';

interface SqlResult {
  schema?: {
    elements?: Array<{
      name?: { some?: string } | string | null;
    }>;
  };
  rows?: unknown[][];
}

export type SpacetimeSqlQuery = (query: string) => Promise<Record<string, unknown>[]>;

export function createSpacetimeSqlQuery(
  config: SpacetimeAdminConfig,
  fetchImpl: typeof fetch = fetch,
): SpacetimeSqlQuery {
  return async (query: string): Promise<Record<string, unknown>[]> => {
    const headers: Record<string, string> = { 'content-type': 'text/plain; charset=utf-8' };
    if (config.token) headers['authorization'] = `Bearer ${config.token}`;

    const response = await fetchImpl(`${trimTrailingSlash(config.uri)}/v1/database/${encodeURIComponent(config.database)}/sql`, {
      method: 'POST',
      headers,
      body: query,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `SpacetimeDB SQL failed with ${response.status}`);
    }
    if (!text.trim()) return [];
    const parsed = JSON.parse(text) as SqlResult[];
    return sqlRowsToObjects(parsed[0]);
  };
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function stringValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
  return '';
}

export function numberValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string' && value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function sqlRowsToObjects(result: SqlResult | undefined): Record<string, unknown>[] {
  if (!result?.schema?.elements || !result.rows) return [];
  const names = result.schema.elements.map(element => {
    const name = element.name;
    return typeof name === 'string' ? name : name?.some ?? '';
  });
  return result.rows.map(row => Object.fromEntries(row.map((value, index) => [names[index], unwrapSqlValue(value)])));
}

function unwrapSqlValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if ('some' in record) return record['some'];
    if ('none' in record) return undefined;
  }
  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
