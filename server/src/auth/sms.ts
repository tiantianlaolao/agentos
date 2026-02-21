import { saveSmsCode, getLatestSmsCode } from './db.js';

const TENCENT_SECRET_ID = process.env.TENCENT_SECRET_ID;
const TENCENT_SECRET_KEY = process.env.TENCENT_SECRET_KEY;
const SMS_SDK_APP_ID = process.env.SMS_SDK_APP_ID;
const SMS_SIGN_NAME = process.env.SMS_SIGN_NAME;
const SMS_TEMPLATE_ID = process.env.SMS_TEMPLATE_ID;

const smsConfigured =
  !!TENCENT_SECRET_ID && !!TENCENT_SECRET_KEY && !!SMS_SDK_APP_ID && !!SMS_SIGN_NAME && !!SMS_TEMPLATE_ID;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function sendVerificationCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  // Rate limit: max 1 SMS per phone per 60 seconds
  const latest = getLatestSmsCode(phone);
  if (latest && Date.now() - latest.created_at < 60_000) {
    return { ok: false, error: '发送过于频繁，请60秒后再试' };
  }

  const code = generateCode();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

  saveSmsCode(phone, code, expiresAt);

  if (!smsConfigured) {
    console.log(`[SMS-DEV] Verification code for ${phone}: ${code}`);
    return { ok: true };
  }

  try {
    const tencentcloud = await import('tencentcloud-sdk-nodejs');
    const SmsClient = tencentcloud.sms.v20210111.Client;

    const client = new SmsClient({
      credential: {
        secretId: TENCENT_SECRET_ID!,
        secretKey: TENCENT_SECRET_KEY!,
      },
      region: 'ap-guangzhou',
      profile: {
        httpProfile: { endpoint: 'sms.tencentcloudapi.com' },
      },
    });

    await client.SendSms({
      SmsSdkAppId: SMS_SDK_APP_ID!,
      SignName: SMS_SIGN_NAME!,
      TemplateId: SMS_TEMPLATE_ID!,
      TemplateParamSet: [code, '5'],
      PhoneNumberSet: [`+86${phone}`],
    });

    console.log(`[SMS] Verification code sent to ${phone}`);
    return { ok: true };
  } catch (err) {
    console.error('[SMS] Failed to send:', err);
    return { ok: false, error: '短信发送失败，请稍后再试' };
  }
}
