import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import { Layout } from './components/Layout';
import { LoginPage, OnboardingPage } from './pages/Auth';
import { DashboardPage } from './pages/Dashboard';
import { InvoiceDetailPage, InvoiceFormPage, InvoicesPage } from './pages/Invoices';
import { ExpenseFormPage, ExpensesPage } from './pages/Expenses';
import { ContactsPage, ProductsPage } from './pages/Catalogs';
import { BankPage } from './pages/Bank';
import { ReportsPage, TaxesPage } from './pages/Reports';
import { AccountingPage } from './pages/Accounting';
import { SettingsPage } from './pages/Settings';
import { PayrollPage } from './pages/Payroll';
import { QuickSalePage } from './pages/QuickSale';
import './styles.css';

function Protected({ children }: { children: ReactNode }) {
  const { loading, user, company } = useSession();
  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (!company) return <Navigate to="/empresa" replace />;
  return <>{children}</>;
}

function App() {
  const { user, loading } = useSession();
  return (
    <Routes>
      <Route path="/login" element={!loading && user ? <Navigate to="/" /> : <LoginPage mode="login" />} />
      <Route path="/registro" element={!loading && user ? <Navigate to="/" /> : <LoginPage mode="register" />} />
      <Route path="/empresa" element={user ? <OnboardingPage /> : <Navigate to="/login" />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<DashboardPage />} />
        <Route path="venta" element={<QuickSalePage />} />
        <Route path="facturas" element={<InvoicesPage />} />
        <Route path="facturas/nueva" element={<InvoiceFormPage />} />
        <Route path="facturas/:id" element={<InvoiceDetailPage />} />
        <Route path="facturas/:id/editar" element={<InvoiceFormPage />} />
        <Route path="gastos" element={<ExpensesPage />} />
        <Route path="gastos/nuevo" element={<ExpenseFormPage />} />
        <Route path="contactos" element={<ContactsPage />} />
        <Route path="productos" element={<ProductsPage />} />
        <Route path="bancos" element={<BankPage />} />
        <Route path="nomina" element={<PayrollPage />} />
        <Route path="impuestos" element={<TaxesPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="contabilidad" element={<AccountingPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
