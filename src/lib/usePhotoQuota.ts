import { useCallback, useState } from 'react';
import { fetchPhotoQuota } from '../api/photos';
import type { PhotoQuota } from '../api/udApi';

// Zużycie limitu zdjęć dla ekranu nowego zgłoszenia. Błąd pobrania (np. starszy backend bez endpointu) = brak komunikatu.
export function usePhotoQuota() {
  const [quota, setQuota] = useState<PhotoQuota | null>(null);
  const refresh = useCallback(() => { fetchPhotoQuota().then(setQuota).catch(() => {}); }, []);
  return { quota, setQuota, refresh };
}
