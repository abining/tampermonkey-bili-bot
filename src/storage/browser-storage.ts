export interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function getBrowserLocalStorage(): BrowserStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStorageValue(
  storage: BrowserStorage | null,
  key: string,
): string | null {
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorageValue(
  storage: BrowserStorage | null,
  key: string,
  value: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
