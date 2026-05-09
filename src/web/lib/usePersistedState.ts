import { useEffect, useState } from "react";

export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
    const [value, setValue] = useState<T>(() => {
        try {
            const raw = localStorage.getItem(key);
            if (raw == null) return initial;
            return JSON.parse(raw) as T;
        } catch {
            return initial;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // ignore quota / disabled storage
        }
    }, [key, value]);
    return [value, setValue];
}
