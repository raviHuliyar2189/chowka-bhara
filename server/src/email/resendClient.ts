import { Resend } from 'resend';
import { env } from '../env';

// Shared between sendMagicLink.ts and sendGameInvite.ts. Null when RESEND_API_KEY isn't set —
// each sender falls back to logging to the console instead, so local dev works with no email
// account configured.
export const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null;
