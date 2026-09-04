import { lazy, StrictMode, Suspense } from 'react';
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
  routes.push(
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
  defaultNotFoundComponent: App,
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
