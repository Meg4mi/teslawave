import { lazy, StrictMode, Suspense, useEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
  type AnyRoute,
} from '@tanstack/react-router';
import './ui/tokens.css';
import { App } from './app/App';
import { Privacy } from './screens/Privacy';

const rootRoute = createRootRoute({ component: () => <Outlet /> });

/**
 * An unknown path is the app, so a driver's mistyped bookmark still works — but the asset
 * layer answers it with a 200, and a search engine would index every typo as a page. This
 * tells it not to. The tag leaves with the component, so a navigation back to `/` is indexed.
 */
function NotFound(): ReactNode {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.append(meta);
    return () => meta.remove();
  }, []);
  return <App />;
}

const routes: AnyRoute[] = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: App }),
  createRoute({ getParentRoute: () => rootRoute, path: '/privacy', component: Privacy }),
];

if (import.meta.env.DEV) {
  // Every signature moment, on demand, so animations get tuned without driving anywhere.
  // Lazy, so it never reaches the production bundle.
  const KitchenSink = lazy(async () => ({
    default: (await import('./screens/KitchenSink')).KitchenSink,
  }));
  const ArtBoard = lazy(async () => ({
    default: (await import('./screens/ArtBoard')).ArtBoard,
  }));
  // The social image, for `scripts/gen-social.mjs` and for judging it by eye.
  const OgBoard = lazy(async () => ({
    default: (await import('./screens/OgBoard')).OgBoard,
  }));
  routes.push(
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/art',
      component: () => (
        <Suspense fallback={null}>
          <ArtBoard />
        </Suspense>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/og',
      component: () => (
        <Suspense fallback={null}>
          <OgBoard />
        </Suspense>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/kitchen-sink',
      component: () => (
        <Suspense fallback={null}>
          <KitchenSink />
        </Suspense>
      ),
    }),
  );
}

const router = createRouter({
  routeTree: rootRoute.addChildren(routes),
  defaultNotFoundComponent: NotFound,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  );
}
