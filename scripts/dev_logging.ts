import { hashIdentifier, summarizeProviderError } from '../src/utils/privacy';

export function printDevOnlyWarning(scriptName: string) {
  console.warn(`[${scriptName}] Development diagnostic script. Do not run against production data unless explicitly required.`);
  if (!allowRawDebugOutput()) {
    console.warn(`[${scriptName}] Raw payload output is redacted. Set ALLOW_RAW_DEBUG_OUTPUT=true only for local debugging.`);
  }
}

export function allowRawDebugOutput(): boolean {
  return process.env.ALLOW_RAW_DEBUG_OUTPUT === 'true';
}

export function safeIdentifier(value: unknown, prefix = 'id'): string {
  return `${prefix}_${hashIdentifier(value)}`;
}

export function summarizeRows(rows: any[] | null | undefined, fields: string[]): Array<Record<string, unknown>> {
  return (rows || []).map((row) => {
    const summary: Record<string, unknown> = {};
    for (const field of fields) {
      const value = row?.[field];
      if (field === 'id' || field.endsWith('_id') || field === 'phone' || field === 'email') {
        summary[field] = value ? safeIdentifier(value, field) : null;
      } else {
        summary[field] = value ?? null;
      }
    }
    return summary;
  });
}

export function logData(label: string, data: unknown) {
  if (allowRawDebugOutput()) {
    console.log(`${label}:`, data);
    return;
  }
  console.log(`${label}:`, summarizeData(data));
}

export function logProviderError(label: string, provider: Parameters<typeof summarizeProviderError>[0], operation: string, error: any) {
  console.error(label, summarizeProviderError(provider, operation, error));
}

function summarizeData(data: unknown): unknown {
  if (Array.isArray(data)) {
    return { type: 'array', count: data.length };
  }
  if (data && typeof data === 'object') {
    return { type: 'object', keys: Object.keys(data as Record<string, unknown>).slice(0, 20) };
  }
  return data;
}
