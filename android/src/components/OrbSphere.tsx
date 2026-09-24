import { useId } from 'react';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

type OrbSphereProps = {
  size: number;
  /** Gradient centre, as fractions of the box (CSS `circle at cx cy`). */
  cx: number;
  cy: number;
  stops: readonly { offset: number; color: string }[];
};

/**
 * A circle filled with a CSS-like radial gradient. CSS defaults to `farthest-corner`,
 * so the SVG radius is the distance from the centre to the far corner of the box.
 */
export function OrbSphere({ size, cx, cy, stops }: OrbSphereProps) {
  const id = `orb${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const r = Math.hypot(Math.max(cx, 1 - cx), Math.max(cy, 1 - cy));
  return (
    <Svg width={size} height={size}>
      <Defs>
        <RadialGradient
          id={id}
          cx={cx}
          cy={cy}
          fx={cx}
          fy={cy}
          r={r}
          gradientUnits="objectBoundingBox"
        >
          {stops.map((stop) => (
            <Stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
    </Svg>
  );
}
