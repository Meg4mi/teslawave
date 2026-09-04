import type { ReactNode } from 'react';
import type { TeslaModel } from '@teslawave/protocol';
import { CarSvg } from './CarSvg';

/**
 * The real car, in the real colour, wherever a car is mentioned: in the picker, on the
 * card, inside the toast. Recolouring live as you choose is the small thing that makes
 * onboarding feel built for you. A vector, so it is the same drawing at every size.
 */
export function CarChip({
  model,
  colour,
  size = 48,
  heading = 0,
}: {
  model: TeslaModel;
  colour: string;
  size?: number;
  heading?: number;
}): ReactNode {
  return <CarSvg className="sprite-chip" model={model} colour={colour} size={size} heading={heading} />;
}
