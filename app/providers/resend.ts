import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_EMAIL_KEY!);

export default resend;
