export interface RateLimitConfig {
  windowMs: number;
  maxPerDevice: number;
  maxPerIp: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  error?: string;
}

interface RateLimitRecord {
  timestamps: number[];
}

export type RateCategory = "messages" | "files" | "links" | "admin_login";

const DEFAULT_CONFIGS: Record<RateCategory, RateLimitConfig> = {
  messages: {
    windowMs: 60_000, // 1 minute
    maxPerDevice: 20, // 20 messages per minute per device
    maxPerIp: 60, // 60 messages per minute per network/IP
  },
  files: {
    windowMs: 60_000,
    maxPerDevice: 20, // 20 file uploads per minute per device
    maxPerIp: 60,
  },
  links: {
    windowMs: 60_000,
    maxPerDevice: 20, // 20 short links per minute per device
    maxPerIp: 60,
  },
  admin_login: {
    windowMs: 60_000,
    maxPerDevice: 3, // 5 login attempts per minute per client
    maxPerIp: 3, // 5 login attempts per minute per IP
  },
};

class SlidingWindowLimiter {
  private deviceRecords = new Map<string, RateLimitRecord>();
  private ipRecords = new Map<string, RateLimitRecord>();
  private lastCleanup = Date.now();

  check(
    category: RateCategory,
    deviceId?: string | null,
    ip?: string | null,
    customConfig?: Partial<RateLimitConfig>,
  ): RateLimitResult {
    const config: RateLimitConfig = {
      ...DEFAULT_CONFIGS[category],
      ...customConfig,
    };

    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Periodic cleanup of stale entries every 60s
    if (now - this.lastCleanup > 60_000) {
      this.cleanup(windowStart);
      this.lastCleanup = now;
    }

    const cleanIp = (ip || "127.0.0.1").trim().slice(0, 64);
    const cleanDeviceId =
      deviceId && deviceId.trim() && deviceId.trim() !== "anonymous"
        ? deviceId.trim().slice(0, 128)
        : `ip:${cleanIp}`;

    const deviceKey = `${category}:dev:${cleanDeviceId}`;
    const ipKey = `${category}:ip:${cleanIp}`;

    // 1. Check IP ceiling across all devices on this IP
    let ipRecord = this.ipRecords.get(ipKey);
    if (!ipRecord) {
      ipRecord = { timestamps: [] };
      this.ipRecords.set(ipKey, ipRecord);
    }
    ipRecord.timestamps = ipRecord.timestamps.filter((t) => t > windowStart);

    if (ipRecord.timestamps.length >= config.maxPerIp) {
      const oldest = ipRecord.timestamps[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + config.windowMs - now) / 1000),
      );
      const errMsg =
        category === "admin_login"
          ? `Too many admin login attempts from this network. Please wait ${retryAfterSeconds}s.`
          : `Too many requests from your network. Please wait ${retryAfterSeconds}s.`;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        error: errMsg,
      };
    }

    // 2. Check Device limit
    let devRecord = this.deviceRecords.get(deviceKey);
    if (!devRecord) {
      devRecord = { timestamps: [] };
      this.deviceRecords.set(deviceKey, devRecord);
    }
    devRecord.timestamps = devRecord.timestamps.filter((t) => t > windowStart);

    if (devRecord.timestamps.length >= config.maxPerDevice) {
      const oldest = devRecord.timestamps[0];
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((oldest + config.windowMs - now) / 1000),
      );
      const errMsg =
        category === "admin_login"
          ? `Too many admin login attempts. Please wait ${retryAfterSeconds}s.`
          : `Too many ${category} submitted. Please wait ${retryAfterSeconds}s.`;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds,
        error: errMsg,
      };
    }

    // Record this attempt
    devRecord.timestamps.push(now);
    ipRecord.timestamps.push(now);

    return {
      allowed: true,
      remaining: Math.max(0, config.maxPerDevice - devRecord.timestamps.length),
      retryAfterSeconds: 0,
    };
  }

  private cleanup(windowStart: number) {
    for (const [key, record] of this.deviceRecords.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > windowStart);
      if (record.timestamps.length === 0) {
        this.deviceRecords.delete(key);
      }
    }
    for (const [key, record] of this.ipRecords.entries()) {
      record.timestamps = record.timestamps.filter((t) => t > windowStart);
      if (record.timestamps.length === 0) {
        this.ipRecords.delete(key);
      }
    }
  }
}

export const rateLimiter = new SlidingWindowLimiter();
