import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

// Create transporter
let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // If SMTP is configured, use it
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_PORT === '465',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  } else {
    // Development: Use console logging instead of actually sending emails
    console.warn('⚠️  SMTP not configured. Email codes will be logged to console only.');
    transporter = {
      sendMail: async (options) => {
        console.log('\n📧 EMAIL (not sent - SMTP not configured):');
        console.log('   To:', options.to);
        console.log('   Subject:', options.subject);
        console.log('   Code:', options.html.match(/\d{6}/)?.[0] || 'N/A');
        console.log('   Configure SMTP in .env to actually send emails\n');
        return { messageId: 'dev-mode' };
      }
    };
  }

  return transporter;
}

// Send verification code email
export async function sendVerificationCode(email, code) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'Interview Prepper <noreply@interviewprepper.com>',
      to: email,
      subject: 'Your Interview Prepper Verification Code',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #fff; margin-bottom: 16px;">Your verification code</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Use this code to sign in to Interview Prepper:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 12px; text-align: center; margin: 32px 0; color: #f59e0b; font-family: 'Courier New', monospace;">
            ${code}
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">This code expires in 10 minutes.</p>
        </div>
      `,
      text: `Your Interview Prepper verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification code sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending verification code:', error);
    throw new Error('Failed to send verification code');
  }
}


