import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import sensible from '@fastify/sensible';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API_PREFIX, RATE_LIMITS } from '@crm/shared';
import { env } from './config/env.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { centralizedErrorHandler } from './middleware/error-handler.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getLoggerConfig() {
  if (env.NODE_ENV === 'test') {
    return false;
  }
  if (env.NODE_ENV === 'development') {
    return {
      level: env.LOG_LEVEL,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true },
      },
    };
  }
  return {
    level: env.LOG_LEVEL,
  };
}

export function buildApp(opts: FastifyServerOptions = {}): FastifyInstance {
  const loggerConfig = getLoggerConfig();

  const fastify = Fastify({
    logger: loggerConfig,
    trustProxy: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB payload limit for large data imports
    ...opts,
  });

  // 1. Security Headers (Helmet)
  fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
        objectSrc: ["'none'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://maps.googleapis.com',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
        ],
        styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
        connectSrc: [
          "'self'",
          'https://maps.googleapis.com',
          'https://*.googleapis.com',
          'https://*.gstatic.com',
          'https://*.google.com',
          'data:',
          'blob:',
          'wss:',
          'ws:',
        ],
        workerSrc: ["'self'", 'blob:'],
        childSrc: ["'self'", 'blob:'],
        frameSrc: ["'self'", 'https://www.google.com', 'https://*.google.com', 'https://maps.googleapis.com'],
      },
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // 2. CORS: Production-safe validation allowing Vercel & Render frontends & configured origins
  const allowedOrigins = new Set<string>();
  if (env.WEB_URL) {
    allowedOrigins.add(env.WEB_URL.replace(/\/+$/, ''));
  }
  if (env.API_URL) {
    allowedOrigins.add(env.API_URL.replace(/\/+$/, ''));
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    allowedOrigins.add(process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, ''));
  }
  if (env.CORS_ALLOWED_ORIGINS) {
    env.CORS_ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean)
      .forEach((o) => allowedOrigins.add(o));
  }

  fastify.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }
      const cleanOrigin = origin.replace(/\/+$/, '');
      let isAllowed = env.NODE_ENV !== 'production' || allowedOrigins.has(cleanOrigin);

      if (!isAllowed) {
        try {
          const parsed = new URL(origin);
          // Allow localhost / 127.0.0.1 in non-production environments
          if (env.NODE_ENV !== 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
            isAllowed = true;
          }
          // Allow trusted preview/production deployments
          if (
            parsed.hostname.endsWith('.onrender.com') ||
            parsed.hostname.endsWith('.vercel.app')
          ) {
            isAllowed = true;
          }
        } catch {}
      }

      if (isAllowed) {
        cb(null, true);
        return;
      }
      // Return false without throwing Error so Fastify cleanly sends CORS rejection header
      cb(null, false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'x-client-platform',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
    exposedHeaders: ['x-request-id', 'content-disposition', 'content-type'],
    credentials: true,
    maxAge: 86400,
  });


  // 3. Cookies
  fastify.register(cookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // 4. Rate Limiting
  fastify.register(rateLimit, {
    max: RATE_LIMITS.DEFAULT_MAX_REQUESTS,
    timeWindow: RATE_LIMITS.DEFAULT_TIME_WINDOW_MS,
    allowList: ['127.0.0.1', 'localhost'],
  });

  // 5. Fastify Sensible
  fastify.register(sensible);

  // 6. Request Correlation ID
  fastify.addHook('preHandler', requestIdMiddleware);

  // 7. Centralized Error Handler
  fastify.setErrorHandler((error, request, reply) => {
    return centralizedErrorHandler(error, request, reply);
  });

  // 8. Register Routes
  // Infrastructure routes: /health and /ready
  fastify.register(healthRoutes);

  // Versioned API routes: /api/v1
  fastify.register(v1Routes, { prefix: API_PREFIX });

  // 9. Static SPA Serving for Desktop & Production
  const candidateDistPaths = [
    path.resolve(__dirname, '../../web/dist'),
    path.resolve(process.cwd(), 'apps/web/dist'),
    path.resolve(process.cwd(), 'dist'),
    path.resolve(process.cwd(), '../web/dist'),
  ];
  const webDistPath = candidateDistPaths.find((p) => fs.existsSync(p)) || candidateDistPaths[0]!;
  if (fs.existsSync(webDistPath)) {
    fastify.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      index: false,
      cacheControl: false,
      decorateReply: true,
      setHeaders: (res, pathName) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (pathName.includes('/assets/') || pathName.includes('\\assets\\')) {
          // Content-hashed Vite assets can be cached immutably for 1 year
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (
          pathName.endsWith('.html') ||
          pathName.includes('sw-') ||
          pathName.endsWith('sw.js') ||
          pathName.endsWith('.webmanifest')
        ) {
          // HTML, service workers, and webmanifests must revalidate
          res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
        } else {
          // Favicons, icons, and static images cached for 1 day
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    });

    let cachedIndexHtml: string | null = null;
    let cachedTechIndexHtml: string | null = null;

    const getHtmlForPath = (targetUrl: string): string => {
      const indexPath = path.join(webDistPath, 'index.html');
      if (!cachedIndexHtml && fs.existsSync(indexPath)) {
        cachedIndexHtml = fs.readFileSync(indexPath, 'utf8');
        cachedTechIndexHtml = cachedIndexHtml
          .replace('href="/manifest-admin.webmanifest"', 'href="/manifest-technician.webmanifest"')
          .replace('id="app-apple-title" content="CRM"', 'id="app-apple-title" content="Technician"')
          .replace('id="app-name-meta" content="Enterprises CRM"', 'id="app-name-meta" content="Enterprises Technician"')
          .replace('id="app-apple-icon" href="/apple-touch-icon.png"', 'id="app-apple-icon" href="/apple-touch-icon-technician.png"')
          .replace('<title id="app-title">Enterprises CRM</title>', '<title id="app-title">Enterprises Technician</title>');
      }
      return targetUrl.startsWith('/technician')
        ? (cachedTechIndexHtml || cachedIndexHtml || '')
        : (cachedIndexHtml || '');
    };

    fastify.get('/', (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(getHtmlForPath('/'));
    });

    fastify.get('/technician', (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(getHtmlForPath('/technician'));
    });

    fastify.get('/technician/', (request, reply) => {
      reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(getHtmlForPath('/technician/'));
    });

    fastify.setNotFoundHandler((request, reply) => {
      const url = request.raw.url || '';
      if (
        !url.startsWith(API_PREFIX) &&
        !url.startsWith('/health') &&
        !url.startsWith('/ready') &&
        !url.startsWith('/socket.io')
      ) {
        reply.header('Cache-Control', 'public, max-age=0, must-revalidate');
        reply.header('Content-Type', 'text/html; charset=utf-8');
        const html = getHtmlForPath(url);
        if (html) {
          return reply.send(html);
        }
        return reply.sendFile('index.html');
      }
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: `Route ${request.method}:${request.url} not found`,
      });
    });
  }

  return fastify;
}

