import { cashHandoversRepository } from './cash-handovers.repository';
import type {
  CashHandoverQueryFilter,
  MarkCashReceivedInput,
  BatchMarkCashReceivedInput,
  SubmitCashHandoverInput,
  BatchSubmitCashHandoverInput,
} from '@crm/validation';
import type { CashHandoverItem, CashHandoverSummary, TechnicianCashSummary } from '@crm/types';
import { HTTP_STATUS } from '@crm/shared';

export class CashHandoversService {
  async getHandovers(
    filters: CashHandoverQueryFilter,
    companyId?: string | null,
    actor?: { id?: string; userId?: string; technicianId?: string; role?: string }
  ) {
    if (actor && String(actor.role || '').toUpperCase() === 'TECHNICIAN') {
      const actorTechId = actor.technicianId || actor.userId || actor.id;
      if (filters.technicianId && filters.technicianId !== actorTechId) {
        const err: any = new Error('Technicians can only access their own cash handover records.');
        err.statusCode = HTTP_STATUS.FORBIDDEN;
        throw err;
      }
      filters.technicianId = actorTechId;
    }
    return cashHandoversRepository.findPaginated(filters, companyId);
  }

  async getHandoverById(
    id: string,
    actor?: { id?: string; userId?: string; technicianId?: string; role?: string }
  ): Promise<CashHandoverItem> {
    const item = await cashHandoversRepository.findById(id);
    if (!item) {
      const err: any = new Error('Cash handover record not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      throw err;
    }
    if (actor && String(actor.role || '').toUpperCase() === 'TECHNICIAN') {
      const actorTechId = actor.technicianId || actor.userId || actor.id;
      if (item.technicianId !== actorTechId) {
        const err: any = new Error('Technicians can only access their own cash handover records.');
        err.statusCode = HTTP_STATUS.FORBIDDEN;
        throw err;
      }
    }
    return item;
  }

  async getSummary(companyId?: string | null, dateFilter?: { startDate?: string; endDate?: string }): Promise<CashHandoverSummary> {
    return cashHandoversRepository.getSummary(companyId, dateFilter);
  }

  async getTechnicianSummary(technicianId: string, companyId?: string | null): Promise<TechnicianCashSummary> {
    if (!technicianId) {
      const err: any = new Error('Technician identifier is required');
      err.statusCode = HTTP_STATUS.BAD_REQUEST;
      throw err;
    }
    return cashHandoversRepository.getTechnicianSummary(technicianId, companyId);
  }

  /**
   * Submit cash handover for verification.
   * Eligible collected cash is submitted by the technician to the admin/finance reviewer.
   */
  async submitHandover(
    id: string,
    actor: { id?: string; userId?: string; technicianId?: string; fullName?: string; displayName?: string; username?: string; role?: string },
    input?: SubmitCashHandoverInput
  ): Promise<{ success: boolean; data: CashHandoverItem; message: string }> {
    const actorId = actor?.technicianId || actor?.userId || actor?.id;
    if (!actor || !actorId) {
      const err: any = new Error('Authentication required');
      err.statusCode = HTTP_STATUS.UNAUTHORIZED;
      throw err;
    }

    const actorName = actor.displayName || actor.fullName || actor.username || 'Technician';
    const updated = await cashHandoversRepository.submitHandover(
      id,
      actorId,
      actorName,
      input?.notes
    );

    return {
      success: true,
      data: updated,
      message: 'Cash handover request submitted successfully.',
    };
  }

  /**
   * Submit multiple collected cash handovers in one atomic action.
   */
  async submitBatchHandover(
    actor: { id?: string; userId?: string; technicianId?: string; fullName?: string; displayName?: string; username?: string; role?: string },
    input: BatchSubmitCashHandoverInput
  ): Promise<{ success: boolean; submittedCount: number; totalAmount: number; items: CashHandoverItem[]; message: string }> {
    const actorId = actor?.technicianId || actor?.userId || actor?.id;
    if (!actor || !actorId) {
      const err: any = new Error('Authentication required');
      err.statusCode = HTTP_STATUS.UNAUTHORIZED;
      throw err;
    }

    const actorName = actor.displayName || actor.fullName || actor.username || 'Technician';
    const result = await cashHandoversRepository.submitBatchHandover(
      input.handoverIds,
      actorId,
      actorName,
      input.notes
    );

    return {
      ...result,
      message: `Successfully submitted ₹${result.totalAmount.toFixed(2)} (${result.submittedCount} handovers) for verification.`,
    };
  }

  /**
   * Mark pending or submitted cash handover as RECEIVED.
   * Only Admin/Owner-authorized users can mark cash as received.
   * Technicians MUST NOT be allowed to confirm their own or any handover.
   */
  async markReceived(
    id: string,
    adminUser: { id?: string; userId?: string; technicianId?: string; displayName?: string; username?: string; role?: string },
    input?: MarkCashReceivedInput
  ): Promise<{ success: boolean; data: CashHandoverItem; message: string }> {
    const adminId = adminUser?.id || adminUser?.userId;
    if (!adminUser || !adminId) {
      const err: any = new Error('Authentication required');
      err.statusCode = HTTP_STATUS.UNAUTHORIZED;
      throw err;
    }

    if (String(adminUser.role || '').toUpperCase() === 'TECHNICIAN') {
      const err: any = new Error('Technicians are not authorized to mark cash handovers as received');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }

    const existing = await cashHandoversRepository.findById(id);
    if (!existing) {
      const err: any = new Error('Cash handover record not found');
      err.statusCode = HTTP_STATUS.NOT_FOUND;
      throw err;
    }

    // A user cannot confirm cash handover collected by themselves as technician
    if (existing.technicianId === adminId || (adminUser.technicianId && existing.technicianId === adminUser.technicianId)) {
      const err: any = new Error('Users are not permitted to confirm receipt of their own cash collections');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }

    const adminName = adminUser.displayName || adminUser.username || 'Admin';
    const updated = await cashHandoversRepository.markReceived(
      id,
      adminId,
      adminName,
      input?.notes
    );

    return {
      success: true,
      data: updated,
      message: 'Cash received successfully.',
    };
  }

  /**
   * Mark multiple pending or submitted cash handovers as RECEIVED in one atomic confirmation.
   * Strictly Owner/Admin authorized. Technicians cannot confirm their own handovers.
   */
  async markBatchReceived(
    adminUser: { id?: string; userId?: string; technicianId?: string; displayName?: string; username?: string; role?: string },
    input: BatchMarkCashReceivedInput
  ): Promise<{ success: boolean; confirmedCount: number; totalAmount: number; items: CashHandoverItem[]; message: string }> {
    const adminId = adminUser?.id || adminUser?.userId;
    if (!adminUser || !adminId) {
      const err: any = new Error('Authentication required');
      err.statusCode = HTTP_STATUS.UNAUTHORIZED;
      throw err;
    }

    if (String(adminUser.role || '').toUpperCase() === 'TECHNICIAN') {
      const err: any = new Error('Technicians are not authorized to mark cash handovers as received');
      err.statusCode = HTTP_STATUS.FORBIDDEN;
      throw err;
    }

    for (const id of input.handoverIds) {
      const existing = await cashHandoversRepository.findById(id);
      if (existing && (existing.technicianId === adminId || (adminUser.technicianId && existing.technicianId === adminUser.technicianId))) {
        const err: any = new Error('Users are not permitted to confirm receipt of their own cash collections');
        err.statusCode = HTTP_STATUS.FORBIDDEN;
        throw err;
      }
    }

    const adminName = adminUser.displayName || adminUser.username || 'Admin';
    const result = await cashHandoversRepository.markBatchReceived(
      input.handoverIds,
      adminId,
      adminName,
      input.notes
    );

    return {
      ...result,
      message: `Successfully confirmed receipt of ₹${result.totalAmount.toFixed(2)} (${result.confirmedCount} handovers).`,
    };
  }
}

export const cashHandoversService = new CashHandoversService();
