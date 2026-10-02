// Kompaktowy trace analizy do logu Metro: co zwrócił backend per zdjęcie i co z tym zrobił
// deterministyczny ogon (split po tablicy, assignRoles, kompozycja, pożyczony kontekst, draft).
// Pełna odpowiedź też idzie do logu (logFetch), ale jest nieczytelna przez długie photoId.
import { vehicleAreaFor, type AnalysisRecord } from './compose';
import type { Box4, VisionPhoto } from './vision';

// photoId = `${Date.now()}-${indeksWGalerii}-${uri}` (gallery.ts) -> "#2/ed5d92ed".
export function shortPhotoId(photoId: string): string {
  const m = photoId.match(/^\d+-(\d+)-/);
  const file = photoId.split('/').pop() ?? photoId;
  return `#${m ? m[1] : '?'}/${file.slice(0, 8)}`;
}

const box = (b: Box4 | null | undefined) => (b ? `[${b.join(',')}]` : '-');
const num = (n: number | null | undefined, d = 3) => (n == null ? '?' : n.toFixed(d));

export function describePhoto(p: VisionPhoto): string {
  const plate = p.plate?.readable ? `${p.plate.text}${p.plate_verified ? '✓' : ''}` : '—';
  const alpr = (p.alpr_all ?? [])
    .map((d) => `${d.text} s=${num(d.score)} a=${num(d.vehicle_area)} v=${box(d.vehicle_bbox)}`)
    .join('; ');
  return [
    `zdj.${p.photo_index} ${shortPhotoId(p.photoId)}`,
    `role=${p.role} q=${num(p.quality, 2)}`,
    `plate=${plate}${p.plate_check ? ` (${p.plate_check})` : ''}`,
    `car=${p.car?.present ? box(p.car.bbox) : '—'} "${p.car?.desc ?? ''}"`,
    `markers=${(p.markers ?? []).join(',') || '—'}`,
    `alpr=${p.alpr_all ? `[${alpr}]` : 'n/d'}`,
  ].join(' ');
}

export function describeRecord(rec: AnalysisRecord): string {
  const photos = rec.photos.map((p, k) => {
    const area = rec.plate ? ` a=${num(vehicleAreaFor(p, rec.plate))}` : '';
    const changed = p.role_model ? ` (model: ${p.role_model})` : '';
    const sel = rec.selected.includes(k) ? '*' : '';
    return `${sel}${shortPhotoId(rec.photoIds[k])} ${p.role}${changed}${area}`;
  });
  const draft = rec.draftOrder.map((d) => `${d.role} ${shortPhotoId(d.photoId)}${d.sharedFrom ? ` (z ${d.sharedFrom})` : ''}`);
  return [
    `${rec.reportId}${rec.splitFrom ? ` (split z ${rec.splitFrom})` : ''} plate=${rec.plate ?? '—'} kat=${rec.categoryId}`,
    `zdjęcia: ${photos.join(', ')}`,
    `draft: ${draft.join(' → ') || '—'}`,
    `review: ${rec.reviewReasons.join('; ') || 'nie'}`,
  ].join(' | ');
}
