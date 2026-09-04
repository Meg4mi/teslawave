import type { ReactNode } from 'react';

/**
 * Stroke icons, inline, no icon font and no emoji: the brief bans emoji in chrome, and a
 * webfont is a blocking request on LTE for a handful of glyphs.
 */
type IconProps = { size?: number | undefined };

const Svg = ({ children, size = 24 }: { children: ReactNode; size?: number | undefined }): ReactNode => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
    focusable="false"
  >
    {children}
  </svg>
);

export const EyeIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z" />
    <circle cx="12" cy="12" r="2.6" />
  </Svg>
);

export const EyeOffIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M4 5l16 14" />
    <path d="M9.6 6.4A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.3 3.7" />
    <path d="M6.3 8.3A16.6 16.6 0 0 0 2 12s3.6 6 10 6c1.2 0 2.3-.2 3.3-.5" />
  </Svg>
);

export const SoundOnIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M5 9.5h3l4.5-3.5v12L8 14.5H5Z" />
    <path d="M16.5 9a4 4 0 0 1 0 6" />
    <path d="M19 6.5a7.5 7.5 0 0 1 0 11" />
  </Svg>
);

export const SoundOffIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M5 9.5h3l4.5-3.5v12L8 14.5H5Z" />
    <path d="M16.5 9.5l5 5M21.5 9.5l-5 5" />
  </Svg>
);

/** Track up: the map turns with you, so the arrow always points where you are going. */
export const TrackUpIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M12 3.5 18.5 20 12 16.2 5.5 20Z" />
  </Svg>
);

/** North up: the map stays put. */
export const NorthUpIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 15V9l4.8 6V9" />
  </Svg>
);

export const SettingsIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M4 8h10M18 8h2M4 16h3M11 16h9" />
    <circle cx="16" cy="8" r="2.2" />
    <circle cx="9" cy="16" r="2.2" />
  </Svg>
);

export const PhoneIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <rect x="7" y="2.6" width="10" height="18.8" rx="2.4" />
    <path d="M10.8 18.4h2.4" />
  </Svg>
);

export const CloseIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const PlusIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const MinusIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M5 12h14" />
  </Svg>
);

export const CheckIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const ChevronRightIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M9.5 6l6 6-6 6" />
  </Svg>
);

/** Back to my car: a crosshair, the symbol every map uses for "where I am". */
export const LocateIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </Svg>
);

export const BackspaceIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <path d="M8.5 5.5h11a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5h-11L3 12Z" />
    <path d="M11.5 9.5l5 5M16.5 9.5l-5 5" />
  </Svg>
);

/** The wave: rings leaving a point. */
export const WaveIcon = ({ size }: IconProps): ReactNode => (
  <Svg size={size}>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
    <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
  </Svg>
);
