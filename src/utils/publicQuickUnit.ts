const PUBLIC_QUICK_UNIT_KEY = 'ssf_public_quick_unit_v1';
const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;

export interface RememberedPublicUnit {
  sectorId: number;
  sectorName: string;
  unitId: number;
  unitName: string;
  savedAt: number;
  expiresAt: number;
}

export function getRememberedPublicUnit(): RememberedPublicUnit | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(PUBLIC_QUICK_UNIT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<RememberedPublicUnit> | null;
    if (
      !parsed ||
      typeof parsed.sectorId !== 'number' ||
      typeof parsed.unitId !== 'number' ||
      typeof parsed.sectorName !== 'string' ||
      typeof parsed.unitName !== 'string' ||
      typeof parsed.expiresAt !== 'number' ||
      !parsed.sectorName.trim() ||
      !parsed.unitName.trim()
    ) {
      window.localStorage.removeItem(PUBLIC_QUICK_UNIT_KEY);
      return null;
    }

    if (Date.now() > parsed.expiresAt) {
      window.localStorage.removeItem(PUBLIC_QUICK_UNIT_KEY);
      return null;
    }

    return {
      sectorId: parsed.sectorId,
      sectorName: parsed.sectorName,
      unitId: parsed.unitId,
      unitName: parsed.unitName,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : Date.now(),
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export function saveRememberedPublicUnit(entry: {
  sectorId: number;
  sectorName: string;
  unitId: number;
  unitName: string;
}): RememberedPublicUnit {
  const now = Date.now();
  const payload: RememberedPublicUnit = {
    sectorId: entry.sectorId,
    sectorName: entry.sectorName,
    unitId: entry.unitId,
    unitName: entry.unitName,
    savedAt: now,
    expiresAt: now + FOURTEEN_DAYS_MS,
  };

  if (typeof window !== 'undefined') {
    try {
      // Security: Never store any Unit Order Code in localStorage
      window.localStorage.setItem(
        PUBLIC_QUICK_UNIT_KEY,
        JSON.stringify(payload)
      );
    } catch {
      // Ignore storage failures
    }
  }

  return payload;
}

export function clearRememberedPublicUnit(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PUBLIC_QUICK_UNIT_KEY);
  } catch {
    // Ignore storage failures
  }
}
