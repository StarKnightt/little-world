import type { Food } from '../src/schema';

export interface Expect {
  /** minutes since midnight */
  at: number;
  food?: Food;
}
export interface Case {
  id: string;
  text: string;
  expect: Expect[];
}

const t = (h: number, m = 0) => h * 60 + m;

export const CASES: Case[] = [
  {
    id: 'bp-diabetes',
    text: 'Blood pressure tablet after breakfast. Diabetes tablet before lunch and before dinner.',
    expect: [{ at: t(8, 30), food: 'after_food' }, { at: t(12, 30), food: 'before_food' }, { at: t(19, 30), food: 'before_food' }],
  },
  {
    id: 'thyroid',
    text: 'Thyroxine 50 mcg when I wake up, on an empty stomach.',
    expect: [{ at: t(7), food: 'empty_stomach' }],
  },
  {
    id: 'eyedrops-exact',
    text: 'Eye drops in both eyes at 10 am and 6 pm.',
    expect: [{ at: t(10) }, { at: t(18) }],
  },
  {
    id: 'twice',
    text: 'Amoxicillin 500mg twice a day with food for the infection.',
    expect: [{ at: t(8), food: 'with_food' }, { at: t(20), food: 'with_food' }],
  },
  {
    id: 'thrice',
    text: 'Paracetamol syrup 5 ml three times a day.',
    expect: [{ at: t(8) }, { at: t(14) }, { at: t(20) }],
  },
  {
    id: 'insulin',
    text: 'Insulin 10 units before breakfast and 8 units before dinner. Check blood glucose at bedtime.',
    expect: [{ at: t(7, 30), food: 'before_food' }, { at: t(19, 30), food: 'before_food' }, { at: t(22) }],
  },
  {
    id: 'inhaler',
    text: 'Two puffs of the preventer inhaler in the morning and at night. Rinse mouth afterwards.',
    expect: [{ at: t(8) }, { at: t(20) }],
  },
  {
    id: 'mixed',
    text: 'Amlodipine 5 mg after breakfast, Metformin 500 mg before lunch and dinner, calcium tablet after lunch, and eye drops at 9 PM.',
    expect: [
      { at: t(8, 30), food: 'after_food' },
      { at: t(12, 30), food: 'before_food' },
      { at: t(13, 30), food: 'after_food' },
      { at: t(19, 30), food: 'before_food' },
      { at: t(21) },
    ],
  },
  {
    id: 'exact-times',
    text: 'Levetiracetam 500 mg at 8:00 and 20:00.',
    expect: [{ at: t(8) }, { at: t(20) }],
  },
  {
    id: 'water',
    text: 'Drink a glass of water at 11 AM and at 4 PM.',
    expect: [{ at: t(11) }, { at: t(16) }],
  },
  {
    id: 'plants',
    text: 'Water the plants at 7 AM. Mist the fern at noon. Move the aloe inside at 6 PM.',
    expect: [{ at: t(7) }, { at: t(12) }, { at: t(18) }],
  },
  {
    id: 'walk',
    text: 'Evening walk for 20 minutes, then the vitamin D capsule after dinner.',
    expect: [{ at: t(18) }, { at: t(20, 30), food: 'after_food' }],
  },
  {
    id: 'loose-phrasing',
    text: 'Thyroid tablet first thing on an empty stomach. Blood pressure tablet after eating. Sleeping tablet right before bed.',
    expect: [{ at: t(7), food: 'empty_stomach' }, { at: t(8, 30), food: 'after_food' }, { at: t(22) }],
  },
  {
    id: 'pm-times',
    text: 'Omeprazole 20mg at 7:30 am before food. Atorvastatin 10 mg at 9:30 pm.',
    expect: [{ at: t(7, 30), food: 'before_food' }, { at: t(21, 30) }],
  },
  {
    id: 'one-line',
    text: 'Aspirin after lunch.',
    expect: [{ at: t(13, 30), food: 'after_food' }],
  },
  {
    id: 'long',
    text: 'Wake up at 6 AM, thyroid tablet. Breakfast at 8, then blood pressure tablet. Diabetes tablet with lunch at 1. Ear drops at 4 PM. Diabetes tablet again with dinner at 8:30 PM. Sleeping tablet at 10:30.',
    expect: [
      { at: t(6), food: 'empty_stomach' },
      { at: t(8) },
      { at: t(13), food: 'with_food' },
      { at: t(16) },
      { at: t(20, 30), food: 'with_food' },
      { at: t(22, 30) },
    ],
  },
  {
    id: 'descriptive',
    text: 'The white tablet (prednisolone 10 mg) with breakfast, the pink tablet at bedtime, and the iron tablet at 11, not with milk.',
    expect: [{ at: t(8), food: 'with_food' }, { at: t(11) }, { at: t(22) }],
  },
  {
    id: 'pet',
    text: 'Feed the cat at 8 AM and 7 PM. Give the kidney tablet with the evening meal.',
    expect: [{ at: t(8) }, { at: t(19) }, { at: t(19) }],
  },
  {
    id: 'noon',
    text: 'Vitamin B12 at noon, magnesium at 9 pm.',
    expect: [{ at: t(12) }, { at: t(21) }],
  },
  {
    id: 'four',
    text: 'Antibiotic eye ointment four times a day: 8, 12, 4 and 8.',
    expect: [{ at: t(8) }, { at: t(12) }, { at: t(16) }, { at: t(20) }],
  },
];
