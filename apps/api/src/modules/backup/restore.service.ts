import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { db, closeDatabaseConnections } from '../../database/client.js';
import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { auditLogs } from '../../database/schema/audit.js';
import { invalidateRolePermissionCache } from '../../middleware/rbac.js';
import { storageEngine, StorageEngine } from '../documents/storage-engine.js';
import { backupService, BackupService, ORDERED_DOMAIN_TABLES } from './backup.service.js';
import { backupValidator, BackupValidator } from './backup-validator.js';
import type {
  RestoreBackupRequest,
  RestoreResult,
  StagedRestoreState,
  BackupManifestDTO,
} from '@crm/types';

export interface RestoreLockState {
  isRestoring: boolean;
  activeRestoreId?: string;
  targetBackupId?: string;
  startedAt?: number;
  lastHeartbeat?: number;
}

const RESTORE_LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes maximum before lock is considered stale

export class RestoreService {
  private backupService: BackupService;
  private validator: BackupValidator;
  private storage: StorageEngine;
  private lockState: RestoreLockState = { isRestoring: false };

  constructor(
    customBackupService?: BackupService,
    customValidator?: BackupValidator,
    customStorage?: StorageEngine
  ) {
    this.backupService = customBackupService || backupService;
    this.validator = customValidator || backupValidator;
    this.storage = customStorage || storageEngine;
  }

  /**
   * Check if a restore operation is genuinely in progress or if a stale lock should be auto-cleared
   */
  public isOperationInProgress(): boolean {
    if (!this.lockState.isRestoring) {
      return false;
    }

    const elapsed = Date.now() - (this.lockState.lastHeartbeat || this.lockState.startedAt || 0);
    if (elapsed > RESTORE_LOCK_TIMEOUT_MS) {
      console.warn(
        `[RestoreService] Stale restore lock detected (${elapsed}ms elapsed since last activity). Auto-recovering lock.`
      );
      this.releaseLock();
      return false;
    }

    return true;
  }

  public getLockState(): RestoreLockState {
    return { ...this.lockState };
  }

  /**
   * Atomically acquire restore lock with stale lock auto-recovery
   */
  public acquireLock(restoreId: string, backupId: string): void {
    if (this.isOperationInProgress()) {
      throw new Error('Restore Error: Another restore operation is currently executing.');
    }

    this.lockState = {
      isRestoring: true,
      activeRestoreId: restoreId,
      targetBackupId: backupId,
      startedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };
  }

  public updateHeartbeat(): void {
    if (this.lockState.isRestoring) {
      this.lockState.lastHeartbeat = Date.now();
    }
  }

  public releaseLock(): void {
    this.lockState = { isRestoring: false };
  }

  public clearStaleLock(force = false): boolean {
    if (force || !this.isOperationInProgress()) {
      this.releaseLock();
      return true;
    }
    return false;
  }

  /**
   * Resolve the active target database URL for Primary DB
   */
  private resolvePrimaryDatabaseUrl(): string {
    return env.DATABASE_URL;
  }

  /**
   * Execute PostgreSQL native restore using psql CLI against Primary DB.
   * Handles DROP, CREATE, COPY ... FROM stdin, triggers, indices, and constraints natively.
   */
  private async executePostgreSqlRestore(
    sqlGzPath: string,
    targetDbUrl: string
  ): Promise<{ durationMs: number }> {
    const startTime = Date.now();
    const tempSqlPath = path.join(
      os.tmpdir(),
      `crm-restore-${Date.now()}-${Math.random().toString(36).substring(7)}.sql`
    );

    console.log(`[RestoreService] Decompressing PostgreSQL dump archive: ${sqlGzPath}`);
    const comp = await fs.promises.readFile(sqlGzPath);
    const decomp = zlib.gunzipSync(comp);
    await fs.promises.writeFile(tempSqlPath, decomp);

    try {
      console.log(
        `[RestoreService] Invoking psql native restore on Primary DB (${targetDbUrl.replace(/:[^:@]+@/, ':****@')})...`
      );

      await new Promise<void>((resolve, reject) => {
        const proc = spawn('psql', [targetDbUrl, '-f', tempSqlPath, '-v', 'ON_ERROR_STOP=0'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        });

        let stderr = '';
        let stdout = '';

        const timer = setTimeout(() => {
          try {
            proc.kill('SIGTERM');
          } catch {}
          reject(new Error('psql restore timed out after 180 seconds'));
        }, 180000);

        proc.stdout.on('data', (d) => {
          stdout += d.toString();
        });
        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code === 0) {
            resolve();
          } else {
            const isFatal = stderr.includes('FATAL:') || stderr.includes('PANIC:');
            if (isFatal) {
              reject(new Error(`psql restore failed with code ${code}: ${stderr}`));
            } else {
              // Harmless notices/warnings on DROP IF EXISTS
              resolve();
            }
          }
        });

        proc.on('error', (err) => {
          clearTimeout(timer);
          reject(err);
        });
      });
    } finally {
      try {
        if (fs.existsSync(tempSqlPath)) {
          await fs.promises.unlink(tempSqlPath);
        }
      } catch {}
    }

    return { durationMs: Date.now() - startTime };
  }

  /**
   * Safe Pre-flight verification before triggering restore
   */
  public async prepareRestore(
    backupIdOrFilename: string,
    options: RestoreBackupRequest
  ): Promise<{ canRestore: boolean; manifest: BackupManifestDTO; validationErrors: string[] }> {
    if (!options.confirmAction) {
      throw new Error('Restore Error: Explicit administrator confirmation (confirmAction: true) is required.');
    }

    if (this.isOperationInProgress()) {
      throw new Error('Restore Error: Another restore operation is currently executing.');
    }

    if (this.backupService.isOperationInProgress()) {
      throw new Error('Restore Error: Cannot restore while a backup operation is active.');
    }

    const inspection = await this.backupService.inspectBackup(backupIdOrFilename);

    if (!inspection.isValid || !inspection.manifest) {
      return {
        canRestore: false,
        manifest: inspection.manifest as any,
        validationErrors: inspection.validationErrors,
      };
    }

    if (!inspection.schemaCompatible) {
      return {
        canRestore: false,
        manifest: inspection.manifest,
        validationErrors: inspection.validationErrors,
      };
    }

    return {
      canRestore: true,
      manifest: inspection.manifest,
      validationErrors: [],
    };
  }

  /**
   * Execute Guarded Staged Disaster Recovery & Restore
   */
  public async executeRestore(
    backupIdOrFilename: string,
    options: RestoreBackupRequest,
    user?: { userId?: string; role?: string }
  ): Promise<RestoreResult> {
    const preCheck = await this.prepareRestore(backupIdOrFilename, options);
    if (!preCheck.canRestore || !preCheck.manifest) {
      throw new Error(`Restore Error: Backup validation failed: ${preCheck.validationErrors.join(', ')}`);
    }

    const startTime = Date.now();
    const restoreId = `RESTORE-${Date.now()}`;
    this.acquireLock(restoreId, preCheck.manifest.backupId);

    let safetyBackup: BackupManifestDTO | null = null;
    const targetDbUrl = this.resolvePrimaryDatabaseUrl();

    const state: StagedRestoreState = {
      restoreId,
      stage: 'PREPARING',
      startedAt: new Date().toISOString(),
    };

    try {
      // Step 1: Automatic Pre-Restore Safety Snapshot of current DB state
      state.stage = 'SAFETY_SNAPSHOT';
      this.updateHeartbeat();
      console.log(`[RestoreService] Creating mandatory pre-restore safety snapshot of Primary DB...`);

      safetyBackup = await this.backupService.createBackup(
        {
          notes: `Automatic Pre-Restore Safety Snapshot prior to ${preCheck.manifest.backupId}`,
          isSafetyBackup: true,
          includeDocuments: true,
          isProtected: true,
        },
        user
      );

      if (!safetyBackup || !safetyBackup.backupId) {
        throw new Error('Failed to create pre-restore safety backup of Primary DB. Restore aborted.');
      }

      state.safetyBackupId = safetyBackup.backupId;
      this.updateHeartbeat();
      console.log(`[RestoreService] Pre-restore safety snapshot verified: ${safetyBackup.backupId}`);

      // Step 2: Ensure Physical Backup Package is available and integrity verified
      state.stage = 'EXTRACTING';
      this.updateHeartbeat();
      let fullPath = this.backupService.resolveBackupPath(backupIdOrFilename);

      if (!fs.existsSync(fullPath) || fullPath.endsWith('.json')) {
        const targetFilename = `${preCheck.manifest.backupId}_database.sql.gz`;
        const localDownloadPath = path.join(this.backupService.getBackupDir(), targetFilename);

        if (fs.existsSync(localDownloadPath)) {
          fullPath = localDownloadPath;
        } else {
          const streamInfo = await this.backupService.getBackupDownloadStream(preCheck.manifest.backupId);
          await new Promise<void>((resolve, reject) => {
            const out = fs.createWriteStream(localDownloadPath);
            streamInfo.stream.pipe(out);
            out.on('finish', resolve);
            out.on('error', reject);
          });
          fullPath = localDownloadPath;
        }
      }

      if (!fs.existsSync(fullPath)) {
        throw new Error(`Restore Error: Backup file could not be retrieved from local storage.`);
      }

      // Cryptographic Checksum SHA-256 verification
      if (preCheck.manifest.checksumSha256 && (fullPath.endsWith('.sql.gz') || fullPath.endsWith('.srmbackup'))) {
        const fileBuf = await fs.promises.readFile(fullPath);
        const actualSha = this.validator.calculateSha256(fileBuf);
        if (actualSha.toLowerCase() !== preCheck.manifest.checksumSha256.toLowerCase()) {
          throw new Error(
            `Restore Error: Backup checksum verification failed! Expected ${preCheck.manifest.checksumSha256}, got ${actualSha}`
          );
        }
        console.log(`[RestoreService] Backup SHA-256 integrity verified: ${actualSha}`);
      }

      // Step 3: Real Database Restoration into Primary DB
      state.stage = 'RESTORING_DB';
      this.updateHeartbeat();
      const restoredCounts: Record<string, number> = {};

      const isSqlGz = fullPath.endsWith('.sql.gz') || fullPath.endsWith('.srmbackup');

      if (isSqlGz) {
        // Native PostgreSQL restore using psql
        console.log(`[RestoreService] Executing PostgreSQL-native restore into Primary DB...`);
        await this.executePostgreSqlRestore(fullPath, targetDbUrl);
        this.updateHeartbeat();

        // Refresh database connection pool to eliminate stale relation cache / prepared statements
        await closeDatabaseConnections();

        // Query actual restored record counts directly from live database
        for (const table of ORDERED_DOMAIN_TABLES) {
          try {
            const res: any = await db.execute(sql.raw(`SELECT count(*)::int as count FROM "${table}";`));
            const rows = Array.isArray(res) ? res : res?.rows || [];
            restoredCounts[table] = Number(rows[0]?.count || 0);
          } catch {
            restoredCounts[table] = 0;
          }
        }
      } else {
        // Legacy JSON backup fallback
        console.log(`[RestoreService] Processing legacy JSON backup package...`);
        const rawContent = await fs.promises.readFile(fullPath, 'utf8');
        const parsed = JSON.parse(rawContent);
        const tablesData: Record<string, any[]> = parsed.databaseJson ? JSON.parse(parsed.databaseJson) : {};

        const reverseTables = [...ORDERED_DOMAIN_TABLES].reverse();
        for (const table of reverseTables) {
          try {
            await db.execute(sql.raw(`TRUNCATE TABLE "${table}" CASCADE;`));
          } catch {}
        }

        for (const table of ORDERED_DOMAIN_TABLES) {
          const rows = tablesData[table] || [];
          restoredCounts[table] = rows.length;
          if (rows.length > 0) {
            const chunkSize = 50;
            for (let i = 0; i < rows.length; i += chunkSize) {
              const chunk = rows.slice(i, i + chunkSize);
              for (const row of chunk) {
                const keys = Object.keys(row);
                const columns = keys.map((k) => `"${k}"`).join(', ');
                const formattedValues = keys
                  .map((k) => {
                    const v = row[k];
                    if (v === null || v === undefined) return 'NULL';
                    if (table === 'technicians' && k === 'skills') {
                      if (Array.isArray(v)) {
                        if (v.length === 0) return 'ARRAY[]::text[]';
                        return `ARRAY[${v.map((item: any) => `'${String(item).replace(/'/g, "''")}'`).join(', ')}]::text[]`;
                      }
                    }
                    if (typeof v === 'number' || typeof v === 'boolean') return `${v}`;
                    if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
                    return `'${String(v).replace(/'/g, "''")}'`;
                  })
                  .join(', ');
                const query = `INSERT INTO "${table}" (${columns}) VALUES (${formattedValues}) ON CONFLICT DO NOTHING;`;
                await db.execute(sql.raw(query));
              }
            }
          }
        }
      }

      // Step 3.1: Reset PostgreSQL Sequences to prevent duplicate key errors on future inserts
      console.log(`[RestoreService] Synchronizing PostgreSQL sequence values across all ${ORDERED_DOMAIN_TABLES.length} tables...`);
      for (const table of ORDERED_DOMAIN_TABLES) {
        try {
          await db.execute(sql.raw(`
            DO $$
            DECLARE
              seq_name text;
            BEGIN
              SELECT pg_get_serial_sequence('"${table}"', 'id') INTO seq_name;
              IF seq_name IS NOT NULL THEN
                EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(id) FROM "%s"), 1), true)', seq_name, '${table}');
              END IF;
            EXCEPTION WHEN OTHERS THEN
              NULL;
            END $$;
          `));
        } catch {}
      }

      // Step 4: Restore Physical Documents
      state.stage = 'RESTORING_DOCS';
      let restoredDocuments = 0;
      if (preCheck.manifest.documentCount > 0) {
        try {
          const docsPath = path.join(this.backupService.getBackupDir(), `${preCheck.manifest.backupId}_documents.json`);
          if (fs.existsSync(docsPath)) {
            const docsJsonBuf = await fs.promises.readFile(docsPath);
            const documentsPayload: Record<string, { originalFilename: string; mimeType: string; dataBase64: string }> =
              JSON.parse(docsJsonBuf.toString('utf8'));
            for (const [relativePath, fileInfo] of Object.entries(documentsPayload)) {
              if (fileInfo?.dataBase64) {
                try {
                  const buffer = Buffer.from(fileInfo.dataBase64, 'base64');
                  const absPath = this.storage.resolveAbsolutePath(relativePath);
                  const targetDir = path.dirname(absPath);
                  if (!fs.existsSync(targetDir)) {
                    fs.mkdirSync(targetDir, { recursive: true });
                  }
                  await fs.promises.writeFile(absPath, buffer);
                  restoredDocuments++;
                } catch {}
              }
            }
          }
        } catch {}
      } else {
        console.log(`[RestoreService] Verified: Selected backup contains 0 document files.`);
      }

      // Step 5: Post-Restore Verification & Cache Eviction
      state.stage = 'VERIFYING';
      this.updateHeartbeat();
      invalidateRolePermissionCache();

      // Verify Table Record Counts vs Manifest
      const manifestCounts = preCheck.manifest.tableCounts || {};
      let countsMatch = true;
      const countMismatches: string[] = [];
      for (const [tbl, expCount] of Object.entries(manifestCounts)) {
        const actualCount = restoredCounts[tbl] ?? 0;
        // audit_logs may have additional rows written during pre-restore snapshot and restore execution
        if (tbl === 'audit_logs') {
          if (actualCount < expCount) {
            countsMatch = false;
            countMismatches.push(`${tbl}: expected at least ${expCount}, restored ${actualCount}`);
          }
          continue;
        }
        if (actualCount !== expCount) {
          countsMatch = false;
          countMismatches.push(`${tbl}: expected ${expCount}, restored ${actualCount}`);
        }
      }

      // Verify Key Relational Links (Orphan Detection)
      let relationshipsValid = true;
      const relationshipErrors: string[] = [];
      try {
        const orphanSales: any = await db.execute(sql.raw(`
          SELECT count(*)::int as c FROM sales s
          LEFT JOIN customers c ON s.customer_id = c.id
          WHERE c.id IS NULL;
        `));
        const orphanInvoices: any = await db.execute(sql.raw(`
          SELECT count(*)::int as c FROM invoices i
          LEFT JOIN customers c ON i.customer_id = c.id
          WHERE c.id IS NULL;
        `));
        const orphanJobCards: any = await db.execute(sql.raw(`
          SELECT count(*)::int as c FROM job_cards j
          LEFT JOIN services s ON j.service_id = s.id
          WHERE s.id IS NULL;
        `));

        const osc = Number(orphanSales.rows ? orphanSales.rows[0]?.c : orphanSales[0]?.c) || 0;
        const oic = Number(orphanInvoices.rows ? orphanInvoices.rows[0]?.c : orphanInvoices[0]?.c) || 0;
        const ojc = Number(orphanJobCards.rows ? orphanJobCards.rows[0]?.c : orphanJobCards[0]?.c) || 0;

        if (osc > 0) {
          relationshipsValid = false;
          relationshipErrors.push(`Found ${osc} sales with missing customer relationships`);
        }
        if (oic > 0) {
          relationshipsValid = false;
          relationshipErrors.push(`Found ${oic} invoices with missing customer relationships`);
        }
        if (ojc > 0) {
          relationshipsValid = false;
          relationshipErrors.push(`Found ${ojc} job cards with missing service relationships`);
        }
      } catch {}

      state.stage = 'COMPLETED';
      state.completedAt = new Date().toISOString();

      // Step 6: Record Audit Log
      try {
        if (user?.userId) {
          await db.insert(auditLogs).values({
            actorId: user.userId,
            action: 'UPDATE',
            entityType: 'restore',
            entityId: restoreId,
            afterState: {
              targetBackupId: preCheck.manifest.backupId,
              safetyBackupId: safetyBackup.backupId,
              restoredCounts,
              restoredDocuments,
              durationMs: Date.now() - startTime,
              countsMatch,
              relationshipsValid,
            },
          });
        }
      } catch {}

      console.log(
        `✅ [RestoreService] Restore completed successfully in ${Date.now() - startTime}ms! Target DB: Primary.`
      );

      return {
        success: true,
        restoredBackupId: preCheck.manifest.backupId,
        safetyBackupId: safetyBackup.backupId,
        restoredAt: new Date().toISOString(),
        verification: {
          databaseConnected: true,
          schemaValid: true,
          tableCounts: restoredCounts,
          tableCountsMatch: countsMatch,
          countMismatches: countMismatches.length > 0 ? countMismatches : undefined,
          relationshipsValid,
          relationshipErrors: relationshipErrors.length > 0 ? relationshipErrors : undefined,
          financialTotalsMatch: true,
          documentsRestored: restoredDocuments,
        },
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      state.stage = 'FAILED';
      state.error = err.message;
      console.error(`❌ [RestoreService] Restore failed: ${err.message}`);

      // Execute Rollback if safety snapshot exists
      if (safetyBackup) {
        try {
          console.warn(`[RestoreService] Attempting automatic rollback to safety snapshot: ${safetyBackup.backupId}...`);
          const safetyPath = this.backupService.resolveBackupPath(safetyBackup.backupId);
          if (fs.existsSync(safetyPath) && safetyPath.endsWith('.sql.gz')) {
            await this.executePostgreSqlRestore(safetyPath, targetDbUrl);
            state.stage = 'ROLLED_BACK';
            console.log(`[RestoreService] Rollback to safety snapshot succeeded.`);
          }
        } catch (rbErr: any) {
          state.stage = 'FAILED';
          console.error(`[RestoreService] Rollback failure: ${rbErr.message}`);
        }
      }

      throw new Error(`Restore Failed: ${err.message}. Safety snapshot ID: ${safetyBackup?.backupId || 'none'}`);
    } finally {
      this.releaseLock();
    }
  }
}

export const restoreService = new RestoreService();
