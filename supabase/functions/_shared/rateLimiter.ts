/**
 * Rate limiter for edge functions
 * Uses Supabase database to track request counts per user/IP
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export class RateLimiter {
  private supabase;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey);
    this.config = config;
  }

  async checkLimit(identifier: string, functionName: string): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.windowMs);

    try {
      // Clean up old records
      await this.supabase
        .from('rate_limits')
        .delete()
        .lt('created_at', windowStart.toISOString());

      // Count recent requests
      const { data, error } = await this.supabase
        .from('rate_limits')
        .select('id')
        .eq('identifier', identifier)
        .eq('function_name', functionName)
        .gte('created_at', windowStart.toISOString());

      if (error) throw error;

      const requestCount = data?.length || 0;
      const remaining = Math.max(0, this.config.maxRequests - requestCount);
      const resetAt = new Date(now.getTime() + this.config.windowMs);

      if (requestCount >= this.config.maxRequests) {
        return { allowed: false, remaining: 0, resetAt };
      }

      // Record this request
      await this.supabase
        .from('rate_limits')
        .insert({
          identifier,
          function_name: functionName,
          created_at: now.toISOString()
        });

      return { allowed: true, remaining: remaining - 1, resetAt };
    } catch (error) {
      // On error, allow the request (fail open for better UX)
      console.error('Rate limiter error:', error);
      return { allowed: true, remaining: this.config.maxRequests, resetAt: new Date(now.getTime() + this.config.windowMs) };
    }
  }
}

/**
 * Gets identifier for rate limiting (user ID or IP address)
 */
export function getRateLimitIdentifier(req: Request, userId?: string): string {
  if (userId) return `user:${userId}`;

  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : 'unknown';
  return `ip:${ip}`;
}

/**
 * Returns rate limit error response
 */
export function rateLimitResponse(resetAt: Date): Response {
  return new Response(
    JSON.stringify({
      error: 'Too many requests. Please try again later.',
      resetAt: resetAt.toISOString()
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': Math.ceil((resetAt.getTime() - Date.now()) / 1000).toString(),
        'X-RateLimit-Reset': resetAt.toISOString()
      }
    }
  );
}
