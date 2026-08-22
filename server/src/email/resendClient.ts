import { Resend } from 'resend';
import { env } from '../env';

// Used by sendMagicLink.ts. Null when RESEND_API_KEY isn't set — falls back to logging to the
// console instead, so local dev works with no email account configured.
export const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
