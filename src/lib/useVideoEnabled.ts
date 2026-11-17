import { useServer } from '../store/useServer';
import { videoSupported } from './video';

// Czy pokazać film (tryb WIDEO aparatu, „Nagraj film”, zgłoszenie z filmem): Android i backend ze schematem ≥ 11 (lib/video.ts).
export const useVideoEnabled = (): boolean => useServer((s) => videoSupported(s.schema));
