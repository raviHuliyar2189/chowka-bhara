import 'dotenv/config';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL'),
  // Optional on purpose — unset means "log magic links to the console instead of emailing them",
  // so local dev works before a Resend account exists. See src/email/sendMagicLink.ts.
  resendApiKey: process.env.RESEND_API_KEY || undefined,
  sessionSecret: required('SESSION_SECRET'),
};
