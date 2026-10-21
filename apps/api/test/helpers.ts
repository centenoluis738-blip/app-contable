import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { createApp } from '../src/app.js';

export const app = createApp();

/** Registra un usuario nuevo, crea su empresa y devuelve un cliente HTTP autenticado. */
export async function setupCompany(overrides: Record<string, unknown> = {}) {
  const email = `u-${randomUUID()}@prueba.test`;
  const reg = await request(app).post('/auth/register').send({ name: 'Prueba', email, password: 'Clave1234' }).expect(201);
  const token = reg.body.token as string;
  const company = await request(app)
    .post('/companies')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Empresa de prueba', currency: 'NIO', country: 'NI', defaultTaxRate: 15, taxRegime: 'general', ...overrides })
    .expect(201);
  const companyId = company.body.id as string;
  const auth = <T extends request.Test>(r: T) => r.set('Authorization', `Bearer ${token}`).set('X-Company-Id', companyId);
  const api = {
    get: (url: string) => auth(request(app).get(url)),
    post: (url: string) => auth(request(app).post(url)),
    put: (url: string) => auth(request(app).put(url)),
    patch: (url: string) => auth(request(app).patch(url)),
    delete: (url: string) => auth(request(app).delete(url)),
  };
  const accounts = (await api.get('/accounts').expect(200)).body as { id: string; code: string; systemKey: string | null; balance: string }[];
  const account = (key: string) => accounts.find((a) => a.systemKey === key || a.code === key)!.id;
  return { token, email, companyId, api, account };
}
