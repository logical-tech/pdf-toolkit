import { useCallback, useRef, useState } from "react";

const LIMIT = 100;
const MERGE_MS = 1000;

// Undoable state. Changes that share a `group` within a second fold into one step, so a drag or a run of
// keystrokes undoes as a whole; `null` as the group applies a change without recording it.
export function useHistory<T>(initial: T) {
  const [h, setH] = useState({ present: initial, past: [] as T[], future: [] as T[] });
  const last = useRef({ group: "", time: 0 });

  const set = useCallback((f: (prev: T) => T, group: string | null = "edit") => {
    const now = Date.now();
    const merge = group === null || (group === last.current.group && now - last.current.time < MERGE_MS);
    if (group !== null) last.current = { group, time: now };
    setH((s) => {
      const next = f(s.present);
      if (next === s.present) return s;
      return { present: next, past: merge ? s.past : [...s.past.slice(-(LIMIT - 1)), s.present], future: merge ? s.future : [] };
    });
  }, []);

  const undo = useCallback(() => {
    last.current = { group: "", time: 0 };
    setH((s) => (s.past.length ? { present: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.present, ...s.future] } : s));
  }, []);

  const redo = useCallback(() => {
    last.current = { group: "", time: 0 };
    setH((s) => (s.future.length ? { present: s.future[0], past: [...s.past, s.present], future: s.future.slice(1) } : s));
  }, []);

  const reset = useCallback((value: T) => {
    last.current = { group: "", time: 0 };
    setH({ present: value, past: [], future: [] });
  }, []);

  return { state: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}
