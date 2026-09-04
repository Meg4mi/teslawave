import { useEffect, useRef, type ReactNode } from 'react';
import { AttributionControl, Map as MlMap, prewarm, setWorkerUrl } from 'maplibre-gl';
import type { MapMouseEvent, MapTouchEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getSelfPlacement, setDisplayOffsetSource, tickWorld, type RenderCar } from '../sim/world';
import { createRenderer, type Renderer } from '../overlay/renderer';
import { buildStyle } from './style';
import { createRoadSnapper } from './snap';
import { MAPLIBRE_WORKER_URL } from './maplibre-worker-url';
import { COPY } from '../ui/copy';
import { MinusIcon, PlusIcon } from '../ui/icons';
import { recordFrameCost } from '../app/testHook';
import { isE2E } from '../config/env';
import './map.css';

export type LiveMapProps = {
  northUp: boolean;
  selectedId: string | null;
  nearbyId: string | null;
  self: { model: string; colour: string } | null;
  /** Rough starting centre, before there is a GPS fix to follow. */
  origin: { lat: number; lng: number } | null;
  onSelect: (id: string | null) => void;
  onReady: (renderer: Renderer) => void;
  /** False once it is clear the tiles are not coming, so the app can say so. */
  onTiles: (loaded: boolean) => void;
};

// Without this the worker request falls through to the SPA handler, which answers with
// index.html, and the map silently renders nothing. See vite-maplibre-worker.ts.
setWorkerUrl(MAPLIBRE_WORKER_URL);
// Start the worker before the map asks for it: it shaves the wait before the first tile, and
// a worker that cannot load fails now, loudly, instead of looking like an empty map.
prewarm();

const FOLLOW_ZOOM = 15.5;
/**
 * The ceiling used to be 17, a zoom and a half above the one we follow at, so pinching in
 * ran out of room almost immediately and read as "pinch barely does anything". OpenMapTiles
 * data stops at zoom 14 and the client overzooms past it, so a higher ceiling costs no tiles.
 */
const MIN_ZOOM = 8;
const MAX_ZOOM = 19;
const ZOOM_STEP = 1;
const SLOW_FRAME_MS = 28;
const HIT_RADIUS_PX = 40;
/** Camera repaints the map; the overlay does not. They run at different rates on purpose. */
const CAMERA_MS = 33;
const CAMERA_SLOW_MS = 66;
const OVERLAY_SLOW_MS = 32;
/** Roughly a tenth of a metre, and a fifth of a degree: below this nothing visibly moves. */
const CAMERA_EPSILON_DEG = 1e-6;
const CAMERA_EPSILON_DEG_BEARING = 0.2;
/**
 * How long the camera stays out of the way after the driver touches the map.
 *
 * It used to follow unconditionally, up to thirty times a second, which meant a pinch was
 * fighting a jumpTo the whole time it lasted — the gesture computes its deltas against a
 * transform that had already been moved out from under it, so zooming felt like it was
 * slipping. Now a gesture wins outright, and the map comes back to you when you stop. The
 * zoom you chose is kept: only the centre and bearing resume.
 */
const CAMERA_HOLD_MS = 6_000;
/** Below this a touch is a tap, not a drag. */
const DRAG_SLOP_PX = 10;
/** Snapping is the one thing here that queries the vector tiles; ration it on slow frames. */
const SNAP_BUDGET = 2;
const SNAP_BUDGET_SLOW = 1;

export function LiveMap({
  northUp,
  selectedId,
  nearbyId,
  self,
  origin,
  onSelect,
  onReady,
  onTiles,
}: LiveMapProps): ReactNode {
  const container = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recentre = useRef<HTMLButtonElement>(null);
  const zoomIn = useRef<HTMLButtonElement>(null);
  const zoomOut = useRef<HTMLButtonElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const carsRef = useRef<RenderCar[]>([]);
  // Props read inside the animation loop, which must not restart when they change.
  const live = useRef({ northUp, selectedId, nearbyId, self });
  useEffect(() => {
    live.current = { northUp, selectedId, nearbyId, self };
  }, [northUp, selectedId, nearbyId, self]);

  // Only until the driver's own position takes over.
  useEffect(() => {
    const map = mapRef.current;
    if (map && origin && !getSelfPlacement()) map.jumpTo({ center: [origin.lng, origin.lat] });
  }, [origin]);

  useEffect(() => {
    const host = container.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const map = new MlMap({
      container: host,
      style: buildStyle(),
      center: [6.1432, 46.2044],
      zoom: FOLLOW_ZOOM,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
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
    // No customAttribution: the tile source already supplies it, and adding ours printed
    // the same sentence twice, on top of the disclaimer.
    map.addControl(new AttributionControl({ compact: true }));
    if (isE2E()) {
      // A handle for debugging the style from a browser console or a test.
      (window as unknown as { __twMap: MlMap }).__twMap = map;
      map.on('error', (event) => console.error('maplibre:', event.error?.message ?? event));
    }
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    const renderer = createRenderer(canvas);
    onReady(renderer);

    // Sprites are drawn on the road they are plausibly on rather than in the field the privacy
    // fuzz put them in. Display only: the position we send is untouched (map/snap.ts).
    const snapper = createRoadSnapper(map);
    setDisplayOffsetSource(snapper.offsetOf);

    const recentreButton = recentre.current;
    let cameraHeldUntil = 0;
    const holdCamera = (): void => {
      cameraHeldUntil = performance.now() + CAMERA_HOLD_MS;
      if (recentreButton) recentreButton.hidden = false;
    };
    /*
     * Gestures only, and only real ones. A tap to select a car still jitters a pixel or two on
     * a car screen, and holding the camera every time somebody tapped would mean it hardly
     * ever followed. Two fingers down is always a pinch; one finger has to travel first.
     */
    let touchFrom: { x: number; y: number } | null = null;
    /*
     * While a finger is down the map itself is re-tessellating every frame, which on an Intel
     * Atom is the whole budget. Our own work — road snapping and trails — stands aside for the
     * duration, so the gesture gets the machine. Neither is missed: a trail gap of half a
     * second fades out anyway, and a snap correction is recomputed as soon as you let go.
     */
    let touching = 0;
    const onTouchStart = (event: TouchEvent): void => {
      touching = event.touches.length;
      const touch = event.touches[0];
      touchFrom = touch ? { x: touch.clientX, y: touch.clientY } : null;
      if (event.touches.length > 1) holdCamera();
    };
    const onTouchEnd = (event: TouchEvent): void => {
      touching = event.touches.length;
    };
    const onTouchMove = (event: TouchEvent): void => {
      if (event.touches.length > 1) return holdCamera();
      const touch = event.touches[0];
      if (!touch || !touchFrom) return;
      if (Math.hypot(touch.clientX - touchFrom.x, touch.clientY - touchFrom.y) > DRAG_SLOP_PX)
        holdCamera();
    };
    host.addEventListener('touchstart', onTouchStart, { passive: true });
    host.addEventListener('touchmove', onTouchMove, { passive: true });
    host.addEventListener('touchend', onTouchEnd, { passive: true });
    host.addEventListener('touchcancel', onTouchEnd, { passive: true });
    host.addEventListener('wheel', holdCamera, { passive: true });
    // MapLibre has its own thresholds; these catch anything the ones above miss. `zoomstart`
    // also fires for our own jumpTo, which is why it checks for an original event.
    map.on('dragstart', holdCamera);
    map.on('zoomstart', (event) => {
      if ('originalEvent' in event && event.originalEvent) holdCamera();
    });

    const follow = (): void => {
      cameraHeldUntil = 0;
      if (recentreButton) recentreButton.hidden = true;
    };
    recentreButton?.addEventListener('click', follow);

    /*
     * Instant, not eased: the follow loop calls jumpTo, which would cancel an easeTo the frame
     * after it started. A whole level at once is also less work than animating through one.
     */
    const stepZoom = (by: number) => (): void => {
      map.setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, map.getZoom() + by)));
    };
    const zoomInAt = stepZoom(ZOOM_STEP);
    const zoomOutAt = stepZoom(-ZOOM_STEP);
    const zoomInButton = zoomIn.current;
    const zoomOutButton = zoomOut.current;
    zoomInButton?.addEventListener('click', zoomInAt);
    zoomOutButton?.addEventListener('click', zoomOutAt);

    /*
     * A map that never loads is the difference between "quiet road" and "this app is
     * broken". Underground car parks, flaky LTE and a tile host having a bad day all look
     * the same from here, so after a grace period we say so rather than showing a void.
     */
    let tilesReported = false;
    const reportTiles = (loaded: boolean): void => {
      if (tilesReported && loaded) return;
      tilesReported = true;
      onTiles(loaded);
    };
    const tileWatchdog = window.setTimeout(() => {
      if (!map.isSourceLoaded('openmaptiles')) reportTiles(false);
    }, 12_000);
    map.on('sourcedata', (event) => {
      if (event.sourceId === 'openmaptiles' && event.isSourceLoaded) reportTiles(true);
    });

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
      if (now >= cameraHeldUntil && recentreButton && !recentreButton.hidden)
        recentreButton.hidden = true;

      if (
        placement &&
        now >= cameraHeldUntil &&
        now - cameraAt >= (halfRate ? CAMERA_SLOW_MS : CAMERA_MS)
      ) {
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
      snapper.update(cars, now, touching > 0 ? 0 : halfRate ? SNAP_BUDGET_SLOW : SNAP_BUDGET);
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
          trails: touching === 0 && !halfRate && cars.length <= 40,
          ambient: cars.length === 0,
          bearing: map.getBearing(),
          zoom: map.getZoom(),
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
      clearTimeout(tileWatchdog);
      cancelAnimationFrame(raf);
      observer.disconnect();
      dprWatch.removeEventListener('change', resize);
      host.removeEventListener('touchstart', onTouchStart);
      host.removeEventListener('touchmove', onTouchMove);
      host.removeEventListener('touchend', onTouchEnd);
      host.removeEventListener('touchcancel', onTouchEnd);
      host.removeEventListener('wheel', holdCamera);
      recentreButton?.removeEventListener('click', follow);
      zoomInButton?.removeEventListener('click', zoomInAt);
      zoomOutButton?.removeEventListener('click', zoomOutAt);
      setDisplayOffsetSource(null);
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
      {/* Only while you have the map. Six seconds after you let go it goes away by itself. */}
      <button type="button" data-touch className="map__recentre" ref={recentre} hidden>
        {COPY.map.recentre}
      </button>

      {/* A two-finger pinch is an awkward thing to make while driving. */}
      <div className="map__zoom">
        <button
          type="button"
          data-touch
          className="control control--zoom"
          ref={zoomIn}
          aria-label={COPY.map.zoomIn}
          title={COPY.map.zoomIn}
        >
          <span className="control__icon" aria-hidden>
            <PlusIcon />
          </span>
        </button>
        <button
          type="button"
          data-touch
          className="control control--zoom"
          ref={zoomOut}
          aria-label={COPY.map.zoomOut}
          title={COPY.map.zoomOut}
        >
          <span className="control__icon" aria-hidden>
            <MinusIcon />
          </span>
        </button>
      </div>
    </div>
  );
}
