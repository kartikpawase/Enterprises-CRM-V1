import dns from 'node:dns';
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {}

import { buildApp } from './app.js';
import { env } from './config/env.js';
import { closeDatabaseConnections, ensureDatabaseInitialized } from './database/client.js';
import { closeRedisConnection } from './redis/client.js';
import { seedInitialSystemData } from './database/seeds/initial.js';
import { emailQueueWorker } from './modules/notifications/email-queue.worker.js';
import { emailScheduler } from './modules/notifications/email-scheduler.js';
import { backupScheduler } from './modules/backup/backup-scheduler.js';
import { configService } from './modules/system/configuration.service.js';

export async function startServer() {
  const app = buildApp();

  // Handle graceful shutdown signals
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      try {
        backupScheduler.stop();
        emailScheduler.stop();
        emailQueueWorker.stopPeriodicRunner();
        await app.close();
        await closeDatabaseConnections();
        await closeRedisConnection();
        console.log('Server and connections closed safely.');
        process.exit(0);
      } catch (err) {
        console.error('Error during graceful shutdown:', err);
        process.exit(1);
      }
    });
  }

  try {
    // Initialize and verify database tables/migrations
    await ensureDatabaseInitialized();

    // Preload system configuration into memory to guarantee zero transaction latency
    try {
      await configService.preloadAll();
    } catch {}

    // Ensure initial roles, permissions, and super admin user exist
    try {
      await seedInitialSystemData();
      console.log('✅ System roles, permissions, and administrator account verified.');
    } catch (seedErr) {
      console.warn('⚠️ Warning: Database seeding encountered an error:', seedErr);
    }

    // Start background transactional email worker and scheduler
    emailQueueWorker.startPeriodicRunner(30000); // Check email queue every 30s
    emailScheduler.start(15); // Check due reminders & expiries every 15m
    console.log('📧 PHPMailer transactional email worker and scheduler initialized.');

    // Initialize automated backup scheduler
    await backupScheduler.initialize();
    console.log('🛡️ Automated Backup Scheduler initialized.');

    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    // Initialize Google Maps & Technician Live Tracking Socket.IO server
    try {
      const { initMapsSocketServer } = await import('./modules/maps/maps-socket.service.js');
      initMapsSocketServer(app.server);
      console.log('🗺️ Google Maps & Technician Live Tracking Socket.IO initialized.');
    } catch (socketErr) {
      console.warn('⚠️ Warning: Maps Socket.IO initialization notice:', socketErr);
    }

    console.log(`\n🚀 Enterprises CRM API running at: ${address}`);
    console.log(`📋 Health check: ${address}/health`);
    console.log(`📋 Readiness probe: ${address}/ready`);
    console.log(`🔗 API v1 root: ${address}/api/v1\n`);

    // 24/7 Keep-Alive heartbeat for Render Free Tier (pings every 10 minutes to prevent idle sleep)
    const keepAliveUrl = process.env.RENDER_EXTERNAL_URL || process.env.KEEP_ALIVE_URL;
    if (keepAliveUrl) {
      const cleanUrl = keepAliveUrl.replace(/\/+$/, '');
      const pingInterval = 10 * 60 * 1000; // 10 minutes
      setInterval(async () => {
        try {
          const res = await fetch(`${cleanUrl}/health`);
          console.log(`[KeepAlive] 24/7 heartbeat ping to ${cleanUrl}/health -> Status ${res.status}`);
        } catch (pingErr: any) {
          console.warn(`[KeepAlive] 24/7 heartbeat ping notice: ${pingErr?.message || pingErr}`);
        }
      }, pingInterval);
      console.log(`⏱️ 24/7 Keep-Alive heartbeat active for Render: ${cleanUrl}/health`);
    }

    // Low-memory container watchdog (proactively frees heap if RSS approaches limit)
    const memCheckInterval = 5 * 60 * 1000;
    setInterval(() => {
      const mem = process.memoryUsage();
      const rssMb = Math.round(mem.rss / 1024 / 1024);
      if (rssMb > 320 && typeof (global as any).gc === 'function') {
        try {
          (global as any).gc();
          const after = process.memoryUsage();
          console.log(`[Memory] Auto-GC triggered (RSS: ${rssMb}MB -> ${Math.round(after.rss / 1024 / 1024)}MB)`);
        } catch {}
      }
    }, memCheckInterval);

    return app;
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Automatically start server
startServer();


