import type { ReactNode } from 'react';
import { BRAND, FUZZ_MAX_M, FUZZ_MIN_M, PRESENCE_EXPIRY_MS } from '@teslawave/protocol';
import { Disclaimer } from '../ui/Disclaimer';
import './onboarding.css';

export function Privacy(): ReactNode {
  return (
    <div className="doc">
      <div className="doc__inner">
        <p className="eyebrow">{BRAND.name}</p>
        <h1>Privacy</h1>
        <p className="onboarding__sub">
          {BRAND.name} is built so that there is nothing to leak. No account, no email, no trip
          history.
        </p>

        <h2>What leaves your car</h2>
        <ul className="privacy__list">
          <li>
            A position blurred by {FUZZ_MIN_M}–{FUZZ_MAX_M} m <strong>before</strong> it leaves the
            device. Your exact position is never sent.
          </li>
          <li>Your heading and speed, so other cars glide instead of jumping.</li>
          <li>The model and colour you picked, and a nickname if you typed one.</li>
          <li>A random id generated in your browser. It is not linked to you or to Tesla.</li>
        </ul>

        <h2>What is kept</h2>
        <ul className="privacy__list">
          <li>
            Positions live in memory for {PRESENCE_EXPIRY_MS / 1000} seconds and are never written
            to a database.
          </li>
          <li>Wave counts, as numbers. Yours, and a daily total per map area.</li>
          <li>No trip history, no routes, no timestamps of where you were.</li>
        </ul>

        <h2>Third parties</h2>
        <ul className="privacy__list">
          <li>Map tiles are served by OpenFreeMap, which sees the tiles your browser asks for.</li>
          <li>Cloudflare Web Analytics counts page views without cookies.</li>
          <li>No advertising, no tracking pixels, no cookie banner because there are no cookies.</li>
        </ul>

        <p className="onboarding__sub">
          Turn on invisible mode any time and you disappear from every other screen within two
          seconds.
        </p>

        <p>
          <a href="/">Back to the map</a>
        </p>
        <Disclaimer inline />
      </div>
    </div>
  );
}
