import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { createUser, findUserByPhone, verifySmsCode } from './db.js';
import { generateToken } from './jwt.js';
import { sendVerificationCode } from './sms.js';

const router = Router();

function isValidPhone(phone: string): boolean {
  return /^1\d{10}$/.test(phone);
}

// POST /auth/send-code
router.post('/send-code', async (req, res) => {
  const { phone } = req.body ?? {};

  if (!phone || !isValidPhone(phone)) {
    res.json({ ok: false, error: '请输入正确的11位手机号' });
    return;
  }

  const result = await sendVerificationCode(phone);
  if (!result.ok) {
    res.json({ ok: false, error: result.error });
    return;
  }

  res.json({ ok: true, data: { message: '验证码已发送' } });
});

// POST /auth/register
router.post('/register', async (req, res) => {
  const { phone, code, password } = req.body ?? {};

  if (!phone || !isValidPhone(phone)) {
    res.json({ ok: false, error: '请输入正确的11位手机号' });
    return;
  }

  if (!password || password.length < 6) {
    res.json({ ok: false, error: '密码不能少于6位' });
    return;
  }

  const existing = findUserByPhone(phone);
  if (existing) {
    res.json({ ok: false, error: '该手机号已注册' });
    return;
  }

  const codeValid = verifySmsCode(phone, code);
  if (!codeValid) {
    res.json({ ok: false, error: '验证码错误或已过期' });
    return;
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const user = createUser(phone, passwordHash);
  const token = generateToken(user.id, user.phone);

  res.json({ ok: true, data: { token, userId: user.id, phone: user.phone } });
});

// POST /auth/login
router.post('/login', async (req, res) => {
  const { phone, password } = req.body ?? {};

  if (!phone || !isValidPhone(phone)) {
    res.json({ ok: false, error: '请输入正确的11位手机号' });
    return;
  }

  if (!password) {
    res.json({ ok: false, error: '请输入密码' });
    return;
  }

  const user = findUserByPhone(phone);
  if (!user) {
    res.json({ ok: false, error: '用户不存在' });
    return;
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    res.json({ ok: false, error: '密码错误' });
    return;
  }

  const token = generateToken(user.id, user.phone);
  res.json({ ok: true, data: { token, userId: user.id, phone: user.phone } });
});

export default router;
