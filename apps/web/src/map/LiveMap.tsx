import { useEffect, useRef, type ReactNode } from 'react';
import { AttributionControl, Map as MlMap } from 'maplibre-gl';
import type { MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSelfPlacement, tickWorld, type RenderCar } from '../sim/world';
import { createRenderer, type Renderer } from '../overlay/renderer';
import { ATTRIBUTION, buildStyle } from './style';
import { recordFrameCost } from '../app/testHook';
import { isE2E } from '../config/env';
import './map.css';

export type LiveMapProps = {
  northUp: boolean;
  selectedId: string | null;
  nearbyId: string | null;
  self: { model: string; colour: string } | null;
  onSelect: (id: string | null) => void;
  onReady: (renderer: Renderer) => void;
};

const FOLLOW_ZOOM = 15.5;
const SLOW_FRAME_MS = 28;
const HIT_RADIUS_PX = 40;
/** Camera repaints the map; the overlay does not. They run at different rates on purpose. */
const CAMERA_MS = 33;
const CAMERA_SLOW_MS = 66;
const OVERLAY_SLOW_MS = 32;
/** Roughly a tenth of a metre, and a fifth of a degree: below this nothing visibly moves. */
const CAMERA_EPSILON_DEG = 1e-6;
const CAMERA_EPSILON_DEG_BEARING = 0.2;

export function LiveMap({
  northUp,
  selectedId,
  nearbyId,
  self,
  onSelect,
  onReady,
}: LiveMapProps): ReactNode {
  const container = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const carsRef = useRef<RenderCar[]>([]);
  // Props read inside the animation loop, which must not restart when they change.
  const live = useRef({ northUp, selectedId, nearbyId, self });
  useEffect(() => {
    live.current = { northUp, selectedId, nearbyId, self };
  }, [northUp, selectedId, nearbyId, self]);

  useEffect(() => {
    const host = container.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const map = new MlMap({
      container: host,
      style: buildStyle(),
      center: [6.1432, 46.2044],
      zoom: FOLLOW_ZOOM,
      minZoom: 8,
      maxZoom: 17,
      attributionControl: false,
      // MSAA costs frames we do not have on an Intel Atom, and the map is flat anyway.
      canvasContextAttributes: { antialias: false, powerPreference: 'low-power' },
      fadeDuration: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      // 2026.26 changed the Tesla browser's pixel density: always read it, never assume it.
      pixelRatio: window.devicePixelRatio,
    });
    map.addControl(new AttributionControl({ compact: true, customAttribution: ATTRIBUTION }));
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const renderer = createRenderer(canvas);
    onReady(renderer);

    let dpr = window.devicePixelRatio;
    const resize = (): void => {
      dpr = window.devicePixelRatio;
      const rect = host.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      map.setPixelRatio(dpr);
      map.resize();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    // Pixel density can change without a resize on the car screen.
    const dprWatch = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    dprWatch.addEventListener('change', resize);

    // Adaptive frame rate, measured, never guessed from the user agent.
    let slowFrames = 0;
    let fastFrames = 0;
    let halfRate = false;
    let lastFrame = performance.now();
    let cameraAt = 0;
    let lastCentre: { lng: number; lat: number; bearing: number } | null = null;
    let overlayAt = 0;
    let raf = 0;
    const instrumented = isE2E();

    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame);
      const delta = now - lastFrame;
      lastFrame = now;

      if (delta > SLOW_FRAME_MS) {
        slowFrames++;
        fastFrames = 0;
      } else {
        fastFrames++;
        slowFrames = 0;
      }
      if (!halfRate && slowFrames > 60) halfRate = true;
      if (halfRate && fastFrames > 300) halfRate = false;

      if (now - overlayAt < (halfRate ? OVERLAY_SLOW_MS : 0)) return;
      overlayAt = now;

      const placement = getSelfPlacement();
      const { northUp: north, self: selfCar } = live.current;

      /*
       * The camera is deliberately not driven at 60 Hz. Every jumpTo repaints the whole
       * vector map, which is the single most expensive thing on screen, while the eye is
       * actually tracking the sprites: those keep animating at full rate because the overlay
       * redraws even when the camera has not moved. A car standing at a light stops
       * repainting the map altogether.
       */
      if (placement && now - cameraAt >= (halfRate ? CAMERA_SLOW_MS : CAMERA_MS)) {
        const bearing = north ? 0 : placement.heading;
        const moved =
          !lastCentre ||
          Math.abs(lastCentre.lat - placement.lat) > CAMERA_EPSILON_DEG ||
          Math.abs(lastCentre.lng - placement.lng) > CAMERA_EPSILON_DEG ||
          Math.abs(lastCentre.bearing - bearing) > CAMERA_EPSILON_DEG_BEARING;
        if (moved) {
          map.jumpTo({ center: [placement.lng, placement.lat], bearing });
          lastCentre = { lat: placement.lat, lng: placement.lng, bearing };
        }
        cameraAt = now;
      }

      const measure = instrumented ? performance.now() : 0;
      const cars = tickWorld(now);
      carsRef.current = cars;
      renderer.render(
        now,
        (lng, lat) => map.project([lng, lat]),
        {
          cars,
          self:
            placement && selfCar
              ? {
                  lat: placement.lat,
                  lng: placement.lng,
                  heading: placement.heading,
                  model: selfCar.model,
                  colour: selfCar.colour,
                }
              : null,
          nearbyId: live.current.nearbyId,
          selectedId: live.current.selectedId,
          trails: !halfRate && cars.length <= 40,
          ambient: cars.length === 0,
          bearing: map.getBearing(),
        },
        dpr,
      );
      if (instrumented) recordFrameCost(performance.now() - measure);
    };
    raf = requestAnimationFrame(frame);

    const pick = (event: MapMouseEvent | MapTouchEvent): void => {
      let best: { id: string; d: number } | null = null;
      for (const car of carsRef.current) {
        const p = map.project([car.placement.lng, car.placement.lat]);
        const d = Math.hypot(p.x - event.point.x, p.y - event.point.y);
        if (d <= HIT_RADIUS_PX && (!best || d < best.d)) best = { id: car.id, d };
      }
      onSelect(best?.id ?? null);
    };
    map.on('click', pick);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      dprWatch.removeEventListener('change', resize);
      map.off('click', pick);
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; everything dynamic goes through `live`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="map">
      <div className="map__gl" ref={container} />
      <canvas className="map__overlay" ref={canvasRef} aria-hidden />
      <div className="map__vignette" aria-hidden />
    </div>
  );
}
