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
        const code = options.html.match(/\d{6}/)?.[0];
        if (code) {
          console.log('   Code:', code);
        }
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
      from: process.env.SMTP_FROM || 'intrview.io <noreply@intrview.io>',
      to: email,
      subject: 'Your intrview.io Verification Code',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #fff; margin-bottom: 16px;">Your verification code</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Use this code to sign in to intrview.io:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 12px; text-align: center; margin: 32px 0; color: #f59e0b; font-family: 'Courier New', monospace;">
            ${code}
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">This code expires in 10 minutes.</p>
        </div>
      `,
      text: `Your intrview.io verification code is: ${code}\n\nThis code expires in 10 minutes.`,
    };

    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Verification code sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending verification code:', error);
    throw new Error('Failed to send verification code');
  }
}

export async function sendPaymentFailedEmail(email, planName, appUrl) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'intrview.io <noreply@intrview.io>',
      to: email,
      subject: 'Action needed: Your intrview.io payment failed',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #fff; margin-bottom: 16px;">Payment failed</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">We couldn't process your payment for the <strong style="color: #fff;">${planName}</strong> plan.</p>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Your access will continue for 7 days while we retry. Please update your payment method to avoid losing your plan.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}/dashboard" style="background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Update Payment Method</a>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">If you believe this is an error, please check with your bank.</p>
        </div>
      `,
      text: `Your intrview.io payment for the ${planName} plan failed. Update your payment method at ${appUrl}/dashboard within 7 days to avoid losing your plan.`,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Payment failed email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending payment failed email:', error);
  }
}

export async function sendPaymentReminderEmail(email, planName, daysRemaining, appUrl) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'intrview.io <noreply@intrview.io>',
      to: email,
      subject: 'Reminder: Update your payment method',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #fff; margin-bottom: 16px;">Payment reminder</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Your <strong style="color: #fff;">${planName}</strong> plan payment is still failing. You have <strong style="color: #f59e0b;">${daysRemaining} days</strong> remaining before your plan is downgraded.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}/dashboard" style="background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Update Payment Method</a>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">Update your payment method to keep your current plan.</p>
        </div>
      `,
      text: `Reminder: Your ${planName} plan payment is still failing. You have ${daysRemaining} days before downgrade. Update at ${appUrl}/dashboard`,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Payment reminder email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending payment reminder email:', error);
  }
}

export async function sendCancellationConfirmationEmail(email, planName, effectiveDate, appUrl) {
  try {
    const formattedDate = effectiveDate
      ? new Date(effectiveDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'end of your billing period';
    const mailOptions = {
      from: process.env.SMTP_FROM || 'intrview.io <noreply@intrview.io>',
      to: email,
      subject: 'Your intrview.io subscription has been cancelled',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #fff; margin-bottom: 16px;">Subscription cancelled</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Your <strong style="color: #fff;">${planName}</strong> plan has been cancelled.</p>
          <p style="color: #b0b0b0; margin-bottom: 24px;">You'll keep all your current features until <strong style="color: #f59e0b;">${formattedDate}</strong>. After that, your account will switch to the Free plan.</p>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Your study plans and progress data will be preserved.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}/settings" style="background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Changed your mind? Resubscribe</a>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">You can undo the cancellation anytime before ${formattedDate}.</p>
        </div>
      `,
      text: `Your intrview.io ${planName} plan has been cancelled. You'll keep all features until ${formattedDate}. Visit ${appUrl}/settings to undo.`,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Cancellation confirmation email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending cancellation confirmation email:', error);
  }
}

export async function sendCancellationWinBackEmail(email, planName, appUrl) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'intrview.io <noreply@intrview.io>',
      to: email,
      subject: 'We miss you at intrview.io',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #fff; margin-bottom: 16px;">Your ${planName} plan has ended</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Your subscription has ended and your account is now on the Free plan.</p>
          <p style="color: #b0b0b0; margin-bottom: 24px;">Your study plans, progress, and data are still here waiting for you. Resubscribe anytime to pick up where you left off.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}/settings" style="background: #f59e0b; color: #000; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Resubscribe</a>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">Thank you for being a part of intrview.io.</p>
        </div>
      `,
      text: `Your intrview.io ${planName} plan has ended. Your data is preserved. Resubscribe anytime at ${appUrl}/settings.`,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Win-back email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending win-back email:', error);
  }
}

export async function sendPaymentFinalWarningEmail(email, planName, appUrl) {
  try {
    const mailOptions = {
      from: process.env.SMTP_FROM || 'intrview.io <noreply@intrview.io>',
      to: email,
      subject: 'Last chance: Your plan will be downgraded',
      html: `
        <div style="font-family: 'Courier New', monospace; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #e5e5e5; padding: 32px; border-radius: 8px;">
          <h2 style="color: #ef4444; margin-bottom: 16px;">Final warning</h2>
          <p style="color: #b0b0b0; margin-bottom: 24px;">This is your last chance to update your payment method. Your <strong style="color: #fff;">${planName}</strong> plan will be downgraded to Free if payment is not resolved.</p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${appUrl}/dashboard" style="background: #ef4444; color: #fff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Update Payment Now</a>
          </div>
          <p style="color: #666; font-size: 12px; text-align: center; margin-top: 24px;">After downgrade, you'll lose access to your current plan features.</p>
        </div>
      `,
      text: `Final warning: Your ${planName} plan will be downgraded to Free if payment is not resolved. Update at ${appUrl}/dashboard`,
    };
    const transporter = getTransporter();
    await transporter.sendMail(mailOptions);
    console.log(`✅ Payment final warning email sent to ${email}`);
  } catch (error) {
    console.error('❌ Error sending payment final warning email:', error);
  }
}
