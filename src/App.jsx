import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { lazy, Suspense, useCallback } from 'react';
import AppShell from './components/layout/AppShell';
import ErrorBoundary from './components/common/ErrorBoundary';
import { DashboardSkeleton, LicenseListSkeleton, LicenseDetailSkeleton } from './components/common/Skeleton';
import { useApi } from './hooks/useApi';
import { useNavigate } from 'react-router-dom';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const DailyChangesPage = lazy(() => import('./pages/DailyChangesPage'));
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'));
const PhoneEarningsPage = lazy(() => import('./pages/PhoneEarningsPage'));
const PhoneEarningsDetailPage = lazy(() => import('./pages/PhoneEarningsDetailPage'));
const LicenseListPage = lazy(() => import('./pages/LicenseListPage'));
const LicenseDetailPage = lazy(() => import('./pages/LicenseDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PayoutWalletsPage = lazy(() => import('./pages/PayoutWalletsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));

function LoginWrapper({ onLogin }) {
  const navigate = useNavigate();
  const handleLogin = useCallback(() => {
    onLogin();
    navigate('/');
  }, [onLogin, navigate]);
  return <LoginPage onLogin={handleLogin} />;
}

export default function App() {
  const api = useApi();

  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(15,15,30,0.9)',
            backdropFilter: 'blur(20px)',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
          },
        }}
      />
      {api.isAuthenticated ? (
        <AppShell api={api}>
          <ErrorBoundary>
            <Suspense fallback={<DashboardSkeleton />}>
              <Routes>
                <Route path="/" element={<DashboardPage api={api} />} />
                <Route path="/daily-changes" element={<DailyChangesPage api={api} />} />
                <Route path="/phone-earnings" element={<PhoneEarningsPage api={api} />} />
                <Route path="/phone-earnings/:phoneName" element={<PhoneEarningsDetailPage api={api} />} />
                <Route path="/analytics" element={<AnalyticsPage api={api} />} />
                <Route path="/licenses" element={<Suspense fallback={<LicenseListSkeleton />}><LicenseListPage api={api} /></Suspense>} />
                <Route path="/licenses/:id" element={<Suspense fallback={<LicenseDetailSkeleton />}><LicenseDetailPage api={api} /></Suspense>} />
                <Route path="/payouts" element={<PayoutWalletsPage />} />
                <Route path="/settings" element={<SettingsPage api={api} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </AppShell>
      ) : (
        <Routes>
          <Route path="*" element={<Suspense fallback={null}><LoginWrapper onLogin={api.onLogin} /></Suspense>} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
