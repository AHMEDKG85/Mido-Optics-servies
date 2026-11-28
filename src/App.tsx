import { lazy, Suspense } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';

const Storefront = lazy(() => import('./shop/ShopApp').then((module) => ({ default: module.ShopApp })));
const Operations = lazy(() => import('./OperationsApp').then((module) => ({ default: module.OperationsApp })));

function AppSurface() {
  return (
    <Suspense fallback={<div className="min-h-screen grid place-items-center text-sm text-slate-500">mido optics</div>}>
      {window.location.pathname.startsWith('/shop') ? <Storefront /> : <Operations />}
    </Suspense>
  );
}

export default function App() {
  return <ErrorBoundary><AppSurface /></ErrorBoundary>;
}
