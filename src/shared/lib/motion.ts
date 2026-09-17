import type { Transition } from 'motion/react';

// Material 3 motion tokens, so every animation in the app shares one feel.
export const ease = {
  emphasized: [0.2, 0, 0, 1] as const,
  emphasizedDecelerate: [0.05, 0.7, 0.1, 1] as const,
  emphasizedAccelerate: [0.3, 0, 0.8, 0.15] as const,
};

export const transitions = {
  enter: { duration: 0.22, ease: ease.emphasizedDecelerate } satisfies Transition,
  exit: { duration: 0.14, ease: ease.emphasizedAccelerate } satisfies Transition,
  spring: { type: 'spring', stiffness: 520, damping: 38, mass: 0.8 } satisfies Transition,
  layout: { type: 'spring', stiffness: 600, damping: 45 } satisfies Transition,
};
