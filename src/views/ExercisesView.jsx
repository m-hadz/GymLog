import { Page, PageHeader } from '../components/PageHeader.jsx';
export function ExercisesView() { return <><PageHeader title="Ejercicios" /><Page>TODO</Page></>; }
export function ExerciseDetailView() { return <><PageHeader title="Ejercicio" back /><Page>TODO</Page></>; }
// Ficha de ejercicio reutilizable (también se abre en una hoja desde el editor de entrenamiento)
export function ExerciseDetail({ id }) { return <div>{id}</div>; }
