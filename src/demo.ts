import type { RoutineSpec } from './schema';

export const MEDICINE_SAMPLE = `Thyroid tablet, 50 mcg, when I wake up, on an empty stomach.
Blood pressure tablet, Amlodipine 5 mg, after breakfast.
Metformin 500 mg before lunch and before dinner.
Eye drops in both eyes at 4 PM.
Calcium tablet after dinner, not with the thyroid tablet.
A 20 minute walk at 6 PM.`;

export const PLANT_SAMPLE = `Water the plants at 7 AM.
Mist the fern at noon.
Turn the potted plants towards the window at 3 PM.
Bring the aloe inside at 6 PM.
Check the seedlings before bed.`;

/**
 * The unedited output of Gemma 2 2B plus the quote check for MEDICINE_SAMPLE (see eval/), saved so the
 * demo works without WebGPU or a download. Gemma missed the walk; that is left in on purpose. Only the title
 * was written by hand.
 */
export const DEMO_SPEC: RoutineSpec = {
  title: 'Daily medicines',
  tasks: [
    {
      name: 'Thyroid tablet',
      dose: '50 mcg',
      hour: 7,
      minute: 0,
      food: 'empty_stomach',
      icon: 'pill',
      note: ''
    },
    {
      name: 'Blood pressure tablet',
      dose: '5 mg',
      hour: 8,
      minute: 30,
      food: 'after_food',
      icon: 'pill',
      note: ''
    },
    {
      name: 'Metformin',
      dose: '500 mg',
      hour: 12,
      minute: 30,
      food: 'before_food',
      icon: 'pill',
      note: ''
    },
    {
      name: 'Metformin',
      dose: '500 mg',
      hour: 19,
      minute: 30,
      food: 'before_food',
      icon: 'pill',
      note: ''
    },
    {
      name: 'Eye drops',
      dose: '',
      hour: 16,
      minute: 0,
      food: 'any',
      icon: 'drops',
      note: 'both eyes'
    },
    {
      name: 'Calcium tablet',
      dose: '1 tablet',
      hour: 20,
      minute: 30,
      food: 'after_food',
      icon: 'pill',
      note: 'not with thyroid tablet'
    }
  ]
};
