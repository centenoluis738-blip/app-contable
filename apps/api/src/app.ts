import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { authRouter } from './modules/auth.js';
import { companiesRouter } from './modules/companies.js';
import { contactsRouter } from './modules/contacts.js';
import { productsRouter } from './modules/products.js';
import { accountsRouter } from './modules/accounts.js';
import { journalRouter } from './modules/journal.js';
import { invoicesRouter } from './modules/invoices.js';
import { expensesRouter } from './modules/expenses.js';
import { bankRouter } from './modules/bank.js';
import { taxesRouter } from './modules/taxes.js';
import { reportsRouter } from './modules/reports.js';
import { supportRouter } from './modules/support.js';
import { payrollRouter } from './modules/payroll.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigins, allowedHeaders: ['Content-Type', 'Authorization', 'X-Company-Id'] }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', async (_req, res) => {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  });

  // Rutas públicas
  app.use('/auth', authRouter);
  app.use('/support', supportRouter);

  // Rutas que requieren sesión. Las de datos contables además exigen la cabecera X-Company-Id.
  app.use('/companies', requireAuth, companiesRouter);
  app.use('/contacts', requireAuth, contactsRouter);
  app.use('/products', requireAuth, productsRouter);
  app.use('/accounts', requireAuth, accountsRouter);
  app.use('/journal', requireAuth, journalRouter);
  app.use('/invoices', requireAuth, invoicesRouter);
  app.use('/expenses', requireAuth, expensesRouter);
  app.use('/bank', requireAuth, bankRouter);
  app.use('/taxes', requireAuth, taxesRouter);
  app.use('/reports', requireAuth, reportsRouter);
  app.use('/payroll', requireAuth, payrollRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
