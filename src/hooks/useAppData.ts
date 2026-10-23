import { useCallback, useEffect, useState } from "react";
import { loadData, saveData } from "../lib/storage";
import type { AppData } from "../lib/types";

export function useAppData() {
  const [data, setData] = useState<AppData>(() => loadData());

  useEffect(() => {
    saveData(data);
  }, [data]);

  const update = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), []);
  const replace = useCallback((next: AppData) => setData(next), []);
  return { data, update, replace };
}
