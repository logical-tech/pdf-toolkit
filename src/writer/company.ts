import { useSyncExternalStore } from "react";
import { EMPTY_COMPANY, type CompanyData } from "./model";

export type { CompanyData };
export { CompanySettings } from "./CompanySettings";

const KEY = "pdf-toolkit:company";
const listeners = new Set<() => void>();
let current: CompanyData = read();

function read(): CompanyData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...EMPTY_COMPANY, ...JSON.parse(raw) } : EMPTY_COMPANY;
  } catch {
    return EMPTY_COMPANY;
  }
}

export const loadCompany = () => current;

export function saveCompany(patch: Partial<CompanyData>) {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // storage full or blocked: keep the in-memory copy for this session
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Live company data: every header, payment block and settings form re-renders on change. */
export const useCompany = () => useSyncExternalStore(subscribe, loadCompany);
