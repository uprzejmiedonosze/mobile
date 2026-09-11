import type { VehicleInfo } from '../types';
import { log } from '../lib/log';

// Zweryfikowane: GET https://parkowanie.zbiorkom.live/WE2W116 zwraca JSON bez auth.
// Odpowiedź: {brand, model, productionYear, fuelTypeName, vehicleTypeName, ...}
export async function fetchVehicleInfo(plateId: string | null, timeoutMs = 8000): Promise<VehicleInfo | null> {
  if (!plateId) return null;
  const key = plateId.replace(/\s/g, '').toUpperCase();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    log.debug('pojazd', `GET zbiorkom.live/${key}`);
    const res = await fetch(`https://parkowanie.zbiorkom.live/${encodeURIComponent(key)}`, { signal: ctrl.signal });
    if (!res.ok) {
      log.warn('pojazd', `${key}: HTTP ${res.status} – pomijam (non-fatal)`);
      return null;
    }
    const j = (await res.json()) as any;
    return {
      brand: j?.brand ?? null,
      model: j?.model ?? null,
      productionYear: j?.productionYear ?? null,
      fuelTypeName: j?.fuelTypeName ?? null,
      vehicleTypeName: j?.vehicleTypeName ?? null,
      raw: j,
    };
  } catch (e: any) {
    log.warn('pojazd', `${key}: ${e?.name === 'AbortError' ? 'timeout' : String(e?.message ?? e).slice(0, 200)}`);
    return null; // non-fatal jak w backendzie MCP
  } finally {
    clearTimeout(t);
  }
}

export function vehicleLine(v: VehicleInfo | null): string {
  if (!v || (!v.brand && !v.model)) return '';
  return `Pojazd marki ${[v.brand, v.model].filter(Boolean).join(' ')}`.trim();
}
