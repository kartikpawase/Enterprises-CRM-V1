import crypto from 'crypto';
import { getRedisClient } from '../../redis/client';
import { env } from '../../config/env';
import { db } from '../../database/client';
import { technicianPortalRepository } from './technician-portal.repository';
import { technicianPortalAccess, technicianOtpChallenges } from '../../database/schema/technician-portal';
import { eq } from 'drizzle-orm';
import {
  TECH_REDIS_KEYS,
  TECHNICIAN_OTP_CONFIG,
  TECHNICIAN_ERROR_CODES,
  TECHNICIAN_AUTH_COOKIE_NAME,
  TECHNICIAN_SESSION_TTL_SECONDS,
} from '@crm/shared';
import type { TechnicianSessionData } from '@crm/types';
import { phpMailerService } from '../notifications/php-mailer.service';

export interface RequestOtpParams {
  phone: string;
  fullName: string;
  ipAddress?: string;
}

export interface VerifyOtpParams {
  challengeId: string;
  otp: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface ResendOtpParams {
  challengeId?: string;
  phone?: string;
  fullName?: string;
  ipAddress?: string;
}

export interface StoredOtpChallenge {
  challengeId: string;
  technicianId: string;
  technicianName: string;
  phone: string;
  email: string;
  otpHash: string;
  createdAt: number;
  expiresAt: number;
  attemptCount: number;
  maxAttempts: number;
}

export class TechnicianAuthService {
  private activeVerifications = new Set<string>();

  private get redis() {
    return getRedisClient();
  }

  /**
   * Cryptographically secure HMAC hash for OTP verification
   */
  public hashOtp(challengeId: string, otp: string): string {
    const secret = env.SESSION_SECRET || 'crm_technician_otp_secret_key_salt';
    return crypto
      .createHmac('sha256', secret)
      .update(`${challengeId}:${otp.trim()}`)
      .digest('hex');
  }

  /**
   * Mask an email address for privacy (e.g. rahul.patil@srenterprises.com -> r***l@srenterprises.com)
   */
  public maskEmail(email: string): string {
    const parts = email.split('@');
    if (parts.length !== 2) return '***@***.com';
    const [name, domain] = parts;
    if (!name || name.length <= 2) {
      return `${name ? name[0] : '*'}***@${domain}`;
    }
    return `${name[0]}***${name[name.length - 1]}@${domain}`;
  }

  /**
   * Request OTP lifecycle
   * Validates technician identity, portal access, registered email, and rate limits.
   * Generates independent OTP challenge with TTL and queues notification email.
   */
  async requestOtp(params: RequestOtpParams) {
    const phone = (params.phone || '').trim();
    const fullName = (params.fullName || '').trim();
    const ip = (params.ipAddress || '127.0.0.1').trim();

    // 1. Validate inputs
    if (!phone || !fullName) {
      const err: any = new Error('Both registered mobile number and full name are required.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw err;
    }

    // 2. IP-based rate limit check
    const ipKey = `${TECH_REDIS_KEYS.RATE_LIMIT_IP_PREFIX}${ip}`;
    const ipRequests = await this.redis.incr(ipKey);
    if (ipRequests === 1) {
      await this.redis.expire(ipKey, TECHNICIAN_OTP_CONFIG.IP_WINDOW_SECONDS);
    }
    if (ipRequests > TECHNICIAN_OTP_CONFIG.MAX_REQUESTS_PER_IP_WINDOW) {
      const err: any = new Error('Too many login attempts from this network. Please wait a few minutes.');
      err.statusCode = 429;
      err.code = TECHNICIAN_ERROR_CODES.OTP_RATE_LIMITED;
      throw err;
    }

    // 3. Find technician by mobile number & name (single authoritative identity source)
    const technician = await technicianPortalRepository.findByPhoneAndName(phone, fullName);
    if (!technician) {
      const err: any = new Error('Technician record not found. Please verify your registered mobile number and name.');
      err.statusCode = 404;
      err.code = TECHNICIAN_ERROR_CODES.TECHNICIAN_NOT_FOUND;
      throw err;
    }

    // 4. Verify technician eligibility/status
    if (technician.status !== 'ACTIVE') {
      const err: any = new Error('Your technician account is not currently active. Contact management.');
      err.statusCode = 403;
      err.code = TECHNICIAN_ERROR_CODES.FORBIDDEN;
      throw err;
    }

    // 5. Verify registered email exists
    if (!technician.email || !technician.email.includes('@') || !technician.email.includes('.')) {
      const err: any = new Error('No registered email address found for your technician profile. Contact administration.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.EMAIL_DELIVERY_FAILED;
      throw err;
    }

    // 6. Verify Technician Portal Access is enabled
    const portalEnabled = await technicianPortalRepository.getPortalAccessStatus(technician.id);
    if (!portalEnabled) {
      const err: any = new Error('Technician Portal access has not been activated for your account.');
      err.statusCode = 403;
      err.code = TECHNICIAN_ERROR_CODES.PORTAL_ACCESS_DISABLED;
      throw err;
    }

    // 7. Technician-scoped rate limit check
    const techLimitKey = `${TECH_REDIS_KEYS.RATE_LIMIT_TECH_PREFIX}${technician.id}`;
    const techRequests = await this.redis.incr(techLimitKey);
    if (techRequests === 1) {
      await this.redis.expire(techLimitKey, TECHNICIAN_OTP_CONFIG.TECH_WINDOW_SECONDS);
    }
    if (techRequests > TECHNICIAN_OTP_CONFIG.MAX_REQUESTS_PER_TECH_WINDOW) {
      const err: any = new Error('Too many OTP requests for this technician account. Please wait before retrying.');
      err.statusCode = 429;
      err.code = TECHNICIAN_ERROR_CODES.OTP_RATE_LIMITED;
      throw err;
    }

    // 8. Invalidate previous active challenge for THIS technician only (Isolated Invalidation)
    const activeTechKey = `${TECH_REDIS_KEYS.ACTIVE_CHALLENGE_PREFIX}${technician.id}`;
    const previousChallengeId = await this.redis.get(activeTechKey);
    if (previousChallengeId) {
      await this.redis.del(`${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${previousChallengeId}`);
    }

    // 9. Generate cryptographically random 6-digit OTP & Unique Challenge ID
    const otp = String(crypto.randomInt(100000, 1000000));
    const challengeId = crypto.randomUUID();
    const otpHash = this.hashOtp(challengeId, otp);
    const now = Date.now();
    const expiresAt = now + TECHNICIAN_OTP_CONFIG.VALIDITY_SECONDS * 1000;

    const challengePayload: StoredOtpChallenge = {
      challengeId,
      technicianId: technician.id,
      technicianName: technician.fullName,
      phone: technician.phone,
      email: technician.email,
      otpHash,
      createdAt: now,
      expiresAt,
      attemptCount: 0,
      maxAttempts: TECHNICIAN_OTP_CONFIG.MAX_ATTEMPTS,
    };

    // 10. Store challenge in Redis with TTL (independent namespace)
    const challengeKey = `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${challengeId}`;
    await this.redis.set(
      challengeKey,
      JSON.stringify(challengePayload),
      'EX',
      TECHNICIAN_OTP_CONFIG.VALIDITY_SECONDS
    );

    // Track active challenge for same-technician invalidation
    await this.redis.set(
      activeTechKey,
      challengeId,
      'EX',
      TECHNICIAN_OTP_CONFIG.VALIDITY_SECONDS
    );

    // Optional durable tracking in PostgreSQL (auditing fallback)
    try {
      await db.insert(technicianOtpChallenges).values({
        challengeId,
        technicianId: technician.id,
        otpHash,
        expiresAt: new Date(expiresAt),
        attemptCount: 0,
        maxAttempts: TECHNICIAN_OTP_CONFIG.MAX_ATTEMPTS,
      });
    } catch {
      // Non-critical: Redis is the primary authoritative state store
    }

    // 11. Dispatch OTP email asynchronously
    this.dispatchOtpEmail({
      toEmail: technician.email,
      technicianName: technician.fullName,
      otp,
      expiresMinutes: Math.round(TECHNICIAN_OTP_CONFIG.VALIDITY_SECONDS / 60),
    }).catch(() => {});

    return {
      success: true,
      data: {
        challengeId,
        maskedEmail: this.maskEmail(technician.email),
        expiresInSeconds: TECHNICIAN_OTP_CONFIG.VALIDITY_SECONDS,
        resendAvailableInSeconds: TECHNICIAN_OTP_CONFIG.RESEND_COOLDOWN_SECONDS,
      },
    };
  }

  /**
   * Resend OTP lifecycle
   */
  async resendOtp(params: ResendOtpParams) {
    let technicianPhone = params.phone;
    let technicianName = params.fullName;

    // If challengeId is provided, resolve technician context from existing challenge
    if (params.challengeId) {
      const challengeKey = `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${params.challengeId}`;
      const raw = await this.redis.get(challengeKey);
      if (raw) {
        try {
          const challenge = JSON.parse(raw) as StoredOtpChallenge;
          technicianPhone = challenge.phone;
          technicianName = challenge.technicianName;
        } catch {}
      }
    }

    if (!technicianPhone || !technicianName) {
      const err: any = new Error('Previous challenge expired or missing. Please enter your credentials again.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.OTP_EXPIRED;
      throw err;
    }

    return this.requestOtp({
      phone: technicianPhone,
      fullName: technicianName,
      ipAddress: params.ipAddress,
    });
  }

  /**
   * Verify OTP lifecycle
   * Validates challenge existence, expiration, attempt counts, and cryptographic hash.
   * Atomically destroys challenge (single-use) and creates authenticated technician session.
   */
  async verifyOtp(params: VerifyOtpParams) {
    const { challengeId, otp, ipAddress, userAgent } = params;

    if (!challengeId || !otp) {
      const err: any = new Error('Both challenge ID and OTP are required.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.VALIDATION_ERROR;
      throw err;
    }

    if (this.activeVerifications.has(challengeId)) {
      const err: any = new Error('Verification already in progress for this code. Please wait.');
      err.statusCode = 409;
      err.code = TECHNICIAN_ERROR_CODES.OTP_ALREADY_USED;
      throw err;
    }
    this.activeVerifications.add(challengeId);

    try {
      const challengeKey = `${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${challengeId}`;
      const raw = await this.redis.get(challengeKey);

    // 1. Challenge does not exist or expired
    if (!raw) {
      const err: any = new Error('Verification code has expired or was already used. Please request a new one.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.OTP_EXPIRED;
      throw err;
    }

    let challenge: StoredOtpChallenge;
    try {
      challenge = JSON.parse(raw) as StoredOtpChallenge;
    } catch {
      await this.redis.del(challengeKey);
      const err: any = new Error('Corrupted challenge state. Please request a new code.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.OTP_EXPIRED;
      throw err;
    }

    // 2. Check expiration timestamp
    if (Date.now() > challenge.expiresAt) {
      await this.redis.del(challengeKey);
      const err: any = new Error('Verification code has expired. Please request a new one.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.OTP_EXPIRED;
      throw err;
    }

    // 3. Check attempt count
    if (challenge.attemptCount >= challenge.maxAttempts) {
      await this.redis.del(challengeKey);
      const err: any = new Error('Maximum verification attempts exceeded. Please request a new code.');
      err.statusCode = 400;
      err.code = TECHNICIAN_ERROR_CODES.OTP_MAX_ATTEMPTS;
      throw err;
    }

    // 4. Constant-time hash comparison
    const candidateHash = this.hashOtp(challengeId, otp);
    const candidateBuf = Buffer.from(candidateHash, 'hex');
    const expectedBuf = Buffer.from(challenge.otpHash, 'hex');

    const isValid =
      candidateBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(candidateBuf, expectedBuf);

    if (!isValid) {
      // Increment attempt count
      const maxAttempts = challenge.maxAttempts || TECHNICIAN_OTP_CONFIG.MAX_ATTEMPTS;
      challenge.attemptCount = (challenge.attemptCount || 0) + 1;
      const remainingAttempts = maxAttempts - challenge.attemptCount;

      if (remainingAttempts <= 0) {
        // Exceeded max attempts: invalidate immediately
        await this.redis.del(challengeKey);
        const err: any = new Error('Maximum verification attempts exceeded. Please request a new code.');
        err.statusCode = 400;
        err.code = TECHNICIAN_ERROR_CODES.OTP_MAX_ATTEMPTS;
        throw err;
      } else {
        // Update attempt count in Redis with remaining TTL
        const remainingTtl = Math.max(1, Math.ceil((challenge.expiresAt - Date.now()) / 1000));
        await this.redis.set(challengeKey, JSON.stringify(challenge), 'EX', remainingTtl);

        const err: any = new Error(`Invalid verification code. ${remainingAttempts} attempt(s) remaining.`);
        err.statusCode = 400;
        err.code = TECHNICIAN_ERROR_CODES.OTP_INVALID;
        throw err;
      }
    }

    // 5. ATOMIC SINGLE-USE CONSUMPTION:
    // Delete the challenge immediately so concurrent requests cannot reuse it.
    await this.redis.del(challengeKey);
    await this.redis.del(`${TECH_REDIS_KEYS.ACTIVE_CHALLENGE_PREFIX}${challenge.technicianId}`);

    // Update database record as used
    try {
      await db
        .update(technicianOtpChallenges)
        .set({ usedAt: new Date() })
        .where(eq(technicianOtpChallenges.challengeId, challengeId));
    } catch {
      // Non-critical
    }

    // 6. Verify portal access is still enabled in authoritative database
    const portalStillEnabled = await technicianPortalRepository.getPortalAccessStatus(challenge.technicianId);
    if (!portalStillEnabled) {
      const err: any = new Error('Portal access has been disabled by an administrator.');
      err.statusCode = 403;
      err.code = TECHNICIAN_ERROR_CODES.PORTAL_ACCESS_DISABLED;
      throw err;
    }

    // 7. Create server-side technician session
    const sessionId = crypto.randomBytes(32).toString('hex');
    const now = Date.now();

    const sessionData: TechnicianSessionData = {
      sessionId,
      technicianId: challenge.technicianId,
      fullName: challenge.technicianName,
      phone: challenge.phone,
      email: challenge.email,
      role: 'Technician',
      portalEnabled: true,
      createdAt: now,
      lastActivityAt: now,
      ipAddress,
      userAgent,
    };

    const sessionKey = `${TECH_REDIS_KEYS.SESSION_PREFIX}${sessionId}`;
    await this.redis.set(
      sessionKey,
      JSON.stringify(sessionData),
      'EX',
      TECHNICIAN_SESSION_TTL_SECONDS
    );

    // Track in technician's active session set
    await this.redis.sadd(
      `${TECH_REDIS_KEYS.USER_SESSIONS_PREFIX}${challenge.technicianId}`,
      sessionId
    );

    // Update lastLoginAt in technician_portal_access table
    try {
      await db
        .update(technicianPortalAccess)
        .set({ lastLoginAt: new Date() })
        .where(eq(technicianPortalAccess.technicianId, challenge.technicianId));
    } catch {
      // Non-critical
    }

    return {
      success: true,
      data: {
        sessionToken: sessionId,
        expiresIn: TECHNICIAN_SESSION_TTL_SECONDS,
        technician: {
          id: challenge.technicianId,
          technicianId: challenge.technicianId,
          fullName: challenge.technicianName,
          phone: challenge.phone,
          email: challenge.email,
          role: 'Technician',
          portalEnabled: true,
        },
      },
    };
    } finally {
      this.activeVerifications.delete(challengeId);
    }
  }

  /**
   * Terminate technician session server-side
   */
  async logout(sessionId: string) {
    if (!sessionId) return { success: true };

    const sessionKey = `${TECH_REDIS_KEYS.SESSION_PREFIX}${sessionId}`;
    const raw = await this.redis.get(sessionKey);

    if (raw) {
      try {
        const session = JSON.parse(raw) as TechnicianSessionData;
        await this.redis.del(sessionKey);
        await this.redis.srem(
          `${TECH_REDIS_KEYS.USER_SESSIONS_PREFIX}${session.technicianId}`,
          sessionId
        );
      } catch {
        await this.redis.del(sessionKey);
      }
    }

    return { success: true, message: 'Logged out successfully' };
  }

  /**
   * Get current authenticated technician identity
   */
  async getMe(sessionId: string) {
    if (!sessionId) {
      return { authenticated: false };
    }

    const sessionKey = `${TECH_REDIS_KEYS.SESSION_PREFIX}${sessionId}`;
    const raw = await this.redis.get(sessionKey);
    if (!raw) {
      return { authenticated: false };
    }

    try {
      const session = JSON.parse(raw) as TechnicianSessionData;
      // Sliding activity window
      session.lastActivityAt = Date.now();
      await this.redis.set(sessionKey, JSON.stringify(session), 'EX', TECHNICIAN_SESSION_TTL_SECONDS);

      return {
        authenticated: true,
        expiresIn: TECHNICIAN_SESSION_TTL_SECONDS,
        technician: {
          id: session.technicianId,
          technicianId: session.technicianId,
          fullName: session.fullName,
          phone: session.phone,
          email: session.email,
          role: session.role,
          portalEnabled: session.portalEnabled,
        },
      };
    } catch {
      return { authenticated: false };
    }
  }

  /**
   * Asynchronous transactional OTP email dispatch
   */
  private async dispatchOtpEmail(params: {
    toEmail: string;
    technicianName: string;
    otp: string;
    expiresMinutes: number;
  }): Promise<void> {
    const subject = `Your Technician Portal Verification Code: ${params.otp}`;
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; }
    .card { max-width: 480px; margin: 0 auto; background: #1e293b; border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .badge { display: inline-block; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.3); color: #22d3ee; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; padding: 4px 10px; border-radius: 9999px; margin-bottom: 16px; }
    .title { font-size: 20px; font-weight: bold; margin: 0 0 8px 0; color: #ffffff; }
    .subtitle { font-size: 13px; color: #94a3b8; margin-bottom: 24px; line-height: 1.5; }
    .otp-box { background: #0f172a; border: 1px solid #38bdf8; border-radius: 12px; padding: 18px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; margin: 0; }
    .warning { font-size: 12px; color: #94a3b8; line-height: 1.6; margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155; }
    .footer { font-size: 11px; color: #64748b; margin-top: 24px; text-align: center; }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">Field Technician Portal</div>
    <h1 class="title">Login Verification Code</h1>
    <p class="subtitle">Hello <strong>${params.technicianName}</strong>, use the following single-use verification code to securely access your field workspace.</p>
    
    <div class="otp-box">
      <div class="otp-code">${params.otp}</div>
    </div>
    
    <div class="warning">
      <p style="margin: 0 0 8px 0;">⏰ <strong>Valid for ${params.expiresMinutes} minutes.</strong></p>
      <p style="margin: 0;">🛡️ <strong>Security Notice:</strong> Never share this verification code with anyone. Enterprises CRM administration will never ask you for your code.</p>
    </div>

    <div class="footer">
      Enterprises CRM • Field Service Operations
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
Enterprises CRM — Field Technician Portal
Login Verification Code

Hello ${params.technicianName},

Your verification code is: ${params.otp}

This code is valid for ${params.expiresMinutes} minutes.
Do NOT share this code with anyone.

Enterprises CRM Field Service Operations
    `.trim();

    try {
      const result = await phpMailerService.dispatch({
        eventType: 'TECHNICIAN_OTP',
        toEmail: params.toEmail,
        toName: params.technicianName,
        subject,
        html,
        text,
        otp: params.otp,
        expiresMinutes: params.expiresMinutes,
        payload: {
          subject,
          html,
          text,
          otp: params.otp,
          expiresMinutes: params.expiresMinutes,
          message: `Your Technician Portal verification code is: ${params.otp}`,
        },
      });

      if (!result.success) {
        console.warn('[TechnicianAuthService] OTP email dispatch warning:', result.error || result.reason);
      }
    } catch (err: any) {
      console.warn('[TechnicianAuthService] Failed to dispatch OTP email:', err?.message || err);
    }
  }

  /**
   * Revoke all active sessions and pending OTP challenges for a technician
   * Called when an administrator disables portal access or resets credentials.
   */
  async revokeAllSessionsForTechnician(technicianId: string): Promise<number> {
    let revokedCount = 0;
    try {
      const userSessionsKey = `${TECH_REDIS_KEYS.USER_SESSIONS_PREFIX}${technicianId}`;
      const sessionIds = await this.redis.smembers(userSessionsKey);
      if (sessionIds && Array.isArray(sessionIds) && sessionIds.length > 0) {
        for (const sid of sessionIds) {
          await this.redis.del(`${TECH_REDIS_KEYS.SESSION_PREFIX}${sid}`);
          revokedCount++;
        }
      }
      await this.redis.del(userSessionsKey);

      // Invalidate any active OTP challenge for this technician
      const activeTechKey = `${TECH_REDIS_KEYS.ACTIVE_CHALLENGE_PREFIX}${technicianId}`;
      const activeChallengeId = await this.redis.get(activeTechKey);
      if (activeChallengeId) {
        await this.redis.del(`${TECH_REDIS_KEYS.OTP_CHALLENGE_PREFIX}${activeChallengeId}`);
        await this.redis.del(activeTechKey);
      }
    } catch (err: any) {
      console.warn('[TechnicianAuthService.revokeAllSessionsForTechnician] Notice:', err?.message);
    }
    return revokedCount;
  }
}

export const technicianAuthService = new TechnicianAuthService();
