import { resend } from './resendClient';

// Same dev fallback as sendMagicLink.ts: no RESEND_API_KEY configured means this prints to the
// console instead of emailing, so the invite flow is testable without an email account.
export async function sendGameInviteEmail(email: string, inviterName: string, link: string): Promise<void> {
  if (!resend) {
    console.log(`[dev email] Game invite for ${email} from ${inviterName}: ${link}`);
    return;
  }
  await resend.emails.send({
    from: 'Chowka Bhara <onboarding@resend.dev>',
    to: email,
    subject: `${inviterName} invited you to play Chowka Bhara`,
    html: `<p>${inviterName} invited you to a game of Chowka Bhara.</p><p><a href="${link}">${link}</a></p>`,
  });
}
