// Hooks de React sobre los stores de lib/ (useSyncExternalStore).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { state, dataChannel, activeChannel, settingsChannel, getActive, getSettings } from './data.js';
import { catalogChannel } from './catalog.js';
import { restChannel, getRest } from './rest-timer.js';
import { analysisWorkouts } from './effective.js';

// Datos sincronizados. Devuelve `state` (workouts, templates, exercises, syncError…).
// Las listas cambian de identidad en cada cambio, así sirven como dependencias de useMemo.
export function useData() {
  useSyncExternalStore(dataChannel.subscribe, dataChannel.version);
  return state;
}

// Entrenamientos con la carga efectiva de peso corporal/lastre/asistido (solo para mostrar y analizar).
export function useAnalysis() {
  useData();
  useCatalog();
  useSettings();
  return analysisWorkouts();
}

// Re-renderiza cuando el catálogo de ejercicios termina de cargar.
export function useCatalog() {
  return useSyncExternalStore(catalogChannel.subscribe, catalogChannel.version);
}

export const useActiveWorkout = () => useSyncExternalStore(activeChannel.subscribe, getActive);
export const useSettings = () => useSyncExternalStore(settingsChannel.subscribe, getSettings);
export const useRest = () => useSyncExternalStore(restChannel.subscribe, getRest);

// Fecha actual que se actualiza cada `ms` (relojes, cronómetros).
export function useNow(ms = 1000, enabled = true) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
  return now;
}
