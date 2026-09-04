export const TESLA_MODELS = ['3', 'Y', 'S', 'X', 'CT'] as const;
export type TeslaModel = (typeof TESLA_MODELS)[number];

export const MODEL_LABELS: Record<TeslaModel, string> = {
  '3': 'Model 3',
  Y: 'Model Y',
  S: 'Model S',
  X: 'Model X',
  CT: 'Cybertruck',
};

export type CarColour = { readonly id: string; readonly label: string; readonly hex: string };

/** The real palette. `id` is the wire format; `hex` never leaves the client. */
export const CAR_COLOURS = [
  { id: 'pearl', label: 'Pearl White', hex: '#eef1f4' },
  { id: 'black', label: 'Solid Black', hex: '#15171a' },
  { id: 'midnight', label: 'Midnight Silver', hex: '#4a4f57' },
  { id: 'deepblue', label: 'Deep Blue', hex: '#1f3a63' },
  { id: 'red', label: 'Red', hex: '#a51a20' },
  { id: 'ultrared', label: 'Ultra Red', hex: '#d61f35' },
  { id: 'stealth', label: 'Stealth Grey', hex: '#6b7078' },
  { id: 'quicksilver', label: 'Quicksilver', hex: '#a8afb7' },
  { id: 'diamond', label: 'Diamond Black', hex: '#22262c' },
  { id: 'steel', label: 'Stainless', hex: '#9ba3ab' },
] as const satisfies readonly CarColour[];

export type CarColourId = (typeof CAR_COLOURS)[number]['id'];

const COLOUR_BY_ID = new Map<string, CarColour>(CAR_COLOURS.map((c) => [c.id, c]));

export const isModel = (v: unknown): v is TeslaModel =>
  typeof v === 'string' && (TESLA_MODELS as readonly string[]).includes(v);

export const isColourId = (v: unknown): v is CarColourId =>
  typeof v === 'string' && COLOUR_BY_ID.has(v);

export const colourOf = (id: string): CarColour => COLOUR_BY_ID.get(id) ?? CAR_COLOURS[1];

/** "blue Model Y" — used in copy, so it stays lowercase and short. */
export function describeCar(model: TeslaModel, colourId: string): string {
  const colour = colourOf(colourId).label.split(' ').at(-1) ?? '';
  return `${colour.toLowerCase()} ${MODEL_LABELS[model]}`;
}
