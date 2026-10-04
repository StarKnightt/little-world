import type { RoutineSpec } from './schema';

export const MEDICINE_SAMPLE = `Thyroid tablet (Thyronorm 50 mcg) as soon as I wake up, on an empty stomach.
BP tablet Amlodipine 5 mg after breakfast.
Metformin 500 mg before lunch and before dinner.
Eye drops in both eyes at 4 pm.
Calcium tablet after dinner, not with the thyroid one.
A short walk in the evening.`;

export const PLANT_SAMPLE = `Water the tulsi every morning at 7.
Mist the fern at noon, it hates dry air.
Turn the money plant towards the window at 3.
Bring the aloe inside at 6 in the evening.
Check the chilli seedlings before bed.`;

/**
 * DEMO_SPEC is the real output Gemma produced for MEDICINE_SAMPLE on my machine,
 * saved so the demo works without WebGPU or a download.
 */
export const DEMO_SPEC: RoutineSpec = {
  title: 'Daily medicines',
  tasks: [
    { name: 'Thyronorm', dose: '50 mcg', hour: 7, minute: 0, food: 'empty_stomach', icon: 'pill', note: 'as soon as I wake up' },
    { name: 'Amlodipine', dose: '5 mg', hour: 8, minute: 30, food: 'after_food', icon: 'pill', note: '' },
    { name: 'Metformin', dose: '500 mg', hour: 12, minute: 30, food: 'before_food', icon: 'pill', note: '' },
    { name: 'Eye drops', dose: '', hour: 16, minute: 0, food: 'any', icon: 'drops', note: 'both eyes' },
    { name: 'Walk', dose: '', hour: 18, minute: 0, food: 'any', icon: 'walk', note: 'a short walk' },
    { name: 'Metformin', dose: '500 mg', hour: 19, minute: 30, food: 'before_food', icon: 'pill', note: '' },
    { name: 'Calcium tablet', dose: '', hour: 20, minute: 30, food: 'after_food', icon: 'pill', note: 'not with the thyroid one' },
  ],
};
