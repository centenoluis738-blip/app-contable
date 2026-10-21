import 'dotenv/config';

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
};

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required('DATABASE_URL', 'postgres://contable:contable@localhost:5432/contable'),
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'solo-para-desarrollo'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:3000').split(','),
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
};
