// Hooks de React sobre los stores de lib/ (useSyncExternalStore).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { state, dataChannel, activeChannel, settingsChannel, getActive, getSettings } from './data.js';
import { catalogChannel } from './catalog.js';
import { restChannel, getRest } from './rest-timer.js';
import { alertChannel, getAlert } from './push.js';
import { analysisWorkouts } from './effective.js';
import { stallMap } from './stalls.js';
import { insights } from './insights.js';
import { streakStats } from './streak.js';
import { syncedSettings } from './data.js';

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

// Estancamiento por ejercicio (feature 06)
// Análisis del historial (features 17, 23–26): tendencias, índice, factores, orden y metas
export function useInsights() {
  useAnalysis();
  return insights();
}

export function useStalls() {
  useAnalysis();
  return stallMap();
}

// Racha y constancia (feature 09) con la meta y las pausas sincronizadas. Un único cálculo para
// Entrenar, Calendario y Perfil.
export function useStreak() {
  const { workouts, user_settings: us } = useData();
  const day = new Date().toDateString();
  return useMemo(() => {
    const { goal, pauses } = syncedSettings();
    return streakStats(workouts, goal, pauses || [], new Date());
  }, [workouts, us, day]);
}

// Re-renderiza cuando el catálogo de ejercicios termina de cargar.
export function useCatalog() {
  return useSyncExternalStore(catalogChannel.subscribe, catalogChannel.version);
}

export const useActiveWorkout = () => useSyncExternalStore(activeChannel.subscribe, getActive);
export const useSettings = () => useSyncExternalStore(settingsChannel.subscribe, getSettings);
export const useRest = () => useSyncExternalStore(restChannel.subscribe, getRest);
// Aviso push del descanso en curso (feature 11): null | {id, status: 'pending'|'ok'|'failed'}
export const useRestAlert = () => useSyncExternalStore(alertChannel.subscribe, getAlert);

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
