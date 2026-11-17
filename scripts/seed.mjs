// Genera ~6 meses de entrenamientos de ejemplo (Push / Pull / Legs con progresión)
// y 3 plantillas, y los sube al servidor. Útil para probar la interfaz y los gráficos.
//   APP_PASSWORD=test DATA_FILE=/tmp/demo.json node dev-server.js &
//   BASE=http://localhost:3000 KEY=test node scripts/seed.mjs
const BASE = process.env.BASE || 'http://localhost:3000';
const KEY = process.env.KEY || 'test';

let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const round = (v, step = 2.5) => Math.round(v / step) * step;

const DAYS = {
  Push: [
    ['Barbell_Bench_Press_-_Medium_Grip', 'Barbell Bench Press - Medium Grip', 60, 8, 4, 2.5],
    ['Incline_Dumbbell_Press', 'Incline Dumbbell Press', 22, 10, 3, 1],
    ['Standing_Military_Press', 'Standing Military Press', 35, 8, 3, 1.25],
    ['Side_Lateral_Raise', 'Side Lateral Raise', 8, 14, 3, 0.5],
    ['Triceps_Pushdown', 'Triceps Pushdown', 25, 12, 3, 1.25],
  ],
  Pull: [
    ['Barbell_Deadlift', 'Barbell Deadlift', 100, 5, 3, 5],
    ['Wide-Grip_Lat_Pulldown', 'Wide-Grip Lat Pulldown', 50, 10, 3, 2.5],
    ['Bent_Over_Barbell_Row', 'Bent Over Barbell Row', 50, 8, 3, 2.5],
    ['Seated_Cable_Rows', 'Seated Cable Rows', 45, 12, 3, 2.5],
    ['Dumbbell_Bicep_Curl', 'Dumbbell Bicep Curl', 12, 10, 3, 1],
  ],
  Legs: [
    ['Barbell_Squat', 'Barbell Squat', 80, 6, 4, 2.5],
    ['Romanian_Deadlift', 'Romanian Deadlift', 70, 8, 3, 2.5],
    ['Leg_Press', 'Leg Press', 140, 10, 3, 5],
    ['Lying_Leg_Curls', 'Lying Leg Curls', 35, 12, 3, 2.5],
    ['Plank', 'Plank', 0, 45, 3, 0],
  ],
};

const workouts = [];
const start = new Date();
start.setMonth(start.getMonth() - 6);
const order = ['Push', 'Pull', 'Legs'];
let k = 0;
for (let d = new Date(start); d < new Date(Date.now() - 864e5); d.setDate(d.getDate() + 1)) {
  const dow = d.getDay();
  if (![1, 2, 4, 5, 6].includes(dow) || rnd() < 0.18) continue;
  const name = order[k++ % 3];
  const progress = (d - start) / (Date.now() - start); // 0 → 1
  const t0 = new Date(d);
  t0.setHours(rnd() < 0.5 ? 7 : 18, Math.floor(rnd() * 50), 0, 0);
  const exercises = DAYS[name].map(([id, exName, w0, reps, sets, inc]) => {
    const weight = w0 ? round(w0 * (1 + 0.28 * progress + (rnd() - 0.5) * 0.05), inc || 2.5) : 0;
    const list = [];
    if (w0 >= 50) list.push({ type: 'W', weight: round(weight * 0.5), reps: 10, done: true });
    for (let s = 0; s < sets; s++) {
      list.push({ type: 'N', weight, reps: Math.max(1, reps - Math.floor(s * rnd() * 1.5) + (rnd() < 0.2 ? 1 : 0)), done: true });
    }
    return { exercise_id: id, name: exName, rest: null, notes: '', sets: list };
  });
  workouts.push({
    id: `w_demo_${t0.getTime()}`,
    name,
    started_at: t0.toISOString(),
    ended_at: new Date(t0.getTime() + (50 + rnd() * 30) * 60000).toISOString(),
    notes: '',
    template_id: `t_demo_${name.toLowerCase()}`,
    exercises,
  });
}

const templates = order.map((name, i) => ({
  id: `t_demo_${name.toLowerCase()}`,
  name,
  folder: '',
  notes: '',
  position: i,
  exercises: DAYS[name].map(([id, exName, , reps, sets]) => ({
    exercise_id: id, name: exName, rest: null,
    sets: Array.from({ length: sets }, () => ({ type: 'N', weight: null, reps })),
  })),
}));

const post = async (table, rows) => {
  const res = await fetch(`${BASE}/api/${table}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-app-key': KEY }, body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`);
};
for (let i = 0; i < workouts.length; i += 100) await post('workouts', workouts.slice(i, i + 100));
await post('templates', templates);
console.log(`Listo: ${workouts.length} entrenamientos y ${templates.length} plantillas en ${BASE}`);
