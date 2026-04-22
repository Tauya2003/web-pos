import nodemailer from "nodemailer";
import { db } from "@/lib/db";

export async function getMailer(organizationId: string) {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  if (!org?.smtpHost || !org.smtpUser || !org.smtpPass) return null;

  return nodemailer.createTransport({
    host: org.smtpHost,
    port: org.smtpPort ?? 587,
    secure: (org.smtpPort ?? 587) === 465,
    auth: { user: org.smtpUser, pass: org.smtpPass },
  });
}

export async function sendReceiptEmail(
  organizationId: string,
  to: string,
  subject: string,
  html: string
) {
  const org = await db.organization.findUnique({ where: { id: organizationId } });
  const mailer = await getMailer(organizationId);
  if (!mailer || !org) throw new Error("SMTP not configured");

  await mailer.sendMail({
    from: org.smtpFrom ?? org.smtpUser!,
    to,
    subject,
    html,
  });
}
