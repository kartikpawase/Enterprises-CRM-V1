import { db } from '../../database/client';
import { chatbotKnowledge, chatbotConversations, chatbotMessages } from '../../database/schema/chatbot';
import { eq, and, desc, sql, ilike, or } from 'drizzle-orm';
import type {
  ChatbotKnowledge,
  CreateChatbotKnowledgeInput,
  UpdateChatbotKnowledgeInput,
  ChatbotResponse,
  ChatbotSourceItem,
  ChatbotMessageItem,
} from '@crm/types';

export const SAFE_FALLBACK_ANSWER =
  "I don't have enough information in my current knowledge base to answer that accurately. Please contact Enterprises CRM customer support for further assistance.";

// Common non-discriminative stop words to ignore during keyword matching
const STOP_WORDS = new Set([
  'what', 'is', 'the', 'are', 'how', 'to', 'for', 'in', 'a', 'an', 'of', 'and', 'or', 'do',
  'does', 'can', 'you', 'tell', 'me', 'about', 'our', 'my', 'we', 'i', 'please', 'give',
  'ka', 'ki', 'ke', 'hai', 'kya', 'ko', 'se', 'me', 'par', 'bhi', 'karo', 'kare', 'hota',
]);

/**
 * Tokenize and normalize query string into unique keywords
 */
export function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[₹$€]/g, ' ')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Chatbot Service: Pure Database-Driven Knowledge Retrieval & Management
 * 100% On-Premise, Deterministic, Zero-AI Integration.
 */
export class ChatbotService {
  /**
   * List all knowledge entries with filtering
   */
  async listKnowledge(params: {
    search?: string;
    category?: string;
    isActive?: 'true' | 'false' | 'all';
    page?: number;
    limit?: number;
  }): Promise<{ data: ChatbotKnowledge[]; total: number; page: number; limit: number }> {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 50));
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (params.category && params.category !== 'all') {
      conditions.push(eq(chatbotKnowledge.category, params.category));
    }

    if (params.isActive === 'true') {
      conditions.push(eq(chatbotKnowledge.isActive, true));
    } else if (params.isActive === 'false') {
      conditions.push(eq(chatbotKnowledge.isActive, false));
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          ilike(chatbotKnowledge.title, q),
          ilike(chatbotKnowledge.question, q),
          ilike(chatbotKnowledge.answer, q),
          ilike(chatbotKnowledge.category, q)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [items, countResult] = await Promise.all([
      db
        .select()
        .from(chatbotKnowledge)
        .where(whereClause)
        .orderBy(desc(chatbotKnowledge.updatedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(chatbotKnowledge)
        .where(whereClause),
    ]);

    return {
      data: items as ChatbotKnowledge[],
      total: countResult[0]?.count || 0,
      page,
      limit,
    };
  }

  /**
   * Get single knowledge item by ID
   */
  async getKnowledgeById(id: string): Promise<ChatbotKnowledge | null> {
    const [item] = await db
      .select()
      .from(chatbotKnowledge)
      .where(eq(chatbotKnowledge.id, id))
      .limit(1);

    return (item as ChatbotKnowledge) || null;
  }

  /**
   * Create new knowledge entry
   */
  async createKnowledge(input: CreateChatbotKnowledgeInput, userId?: string): Promise<ChatbotKnowledge> {
    const title = (input.title || '').trim();
    const category = (input.category || '').trim();
    const question = (input.question || '').trim();
    const answer = (input.answer || '').trim();

    try {
      const [created] = await db
        .insert(chatbotKnowledge)
        .values({
          title,
          category,
          question,
          answer,
          isActive: input.isActive ?? true,
          isPublished: true,
          createdBy: userId || null,
        })
        .returning();

      return created as ChatbotKnowledge;
    } catch (err: any) {
      // Fallback if userId does not exist in users table
      const [created] = await db
        .insert(chatbotKnowledge)
        .values({
          title,
          category,
          question,
          answer,
          isActive: input.isActive ?? true,
          isPublished: true,
          createdBy: null,
        })
        .returning();

      return created as ChatbotKnowledge;
    }
  }

  /**
   * Update existing knowledge entry
   */
  async updateKnowledge(id: string, input: UpdateChatbotKnowledgeInput): Promise<ChatbotKnowledge | null> {
    const updateValues: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (input.title !== undefined) updateValues.title = (input.title || '').trim();
    if (input.category !== undefined) updateValues.category = (input.category || '').trim();
    if (input.question !== undefined) updateValues.question = (input.question || '').trim();
    if (input.answer !== undefined) updateValues.answer = (input.answer || '').trim();
    if (input.isActive !== undefined) updateValues.isActive = input.isActive;
    if (input.isPublished !== undefined) updateValues.isPublished = input.isPublished;

    const [updated] = await db
      .update(chatbotKnowledge)
      .set(updateValues)
      .where(eq(chatbotKnowledge.id, id))
      .returning();

    return (updated as ChatbotKnowledge) || null;
  }

  /**
   * Delete knowledge entry
   */
  async deleteKnowledge(id: string): Promise<boolean> {
    const result = await db.delete(chatbotKnowledge).where(eq(chatbotKnowledge.id, id)).returning({ id: chatbotKnowledge.id });
    return result.length > 0;
  }

  /**
   * Publish knowledge: Marks all active entries as published and refreshes timestamp
   */
  async publishKnowledge(): Promise<{ publishedCount: number }> {
    const result = await db
      .update(chatbotKnowledge)
      .set({
        isPublished: true,
        updatedAt: new Date(),
      })
      .where(eq(chatbotKnowledge.isActive, true))
      .returning({ id: chatbotKnowledge.id });

    return { publishedCount: result.length };
  }

  /**
   * High-Precision Database Knowledge Search
   * Evaluates active, published records and ranks them by semantic relevance.
   */
  async findBestMatchingKnowledge(userQuery: string): Promise<{
    matched: boolean;
    answer: string;
    sources: ChatbotSourceItem[];
  }> {
    const cleanedQuery = userQuery.trim().toLowerCase();
    if (!cleanedQuery) {
      return {
        matched: false,
        answer: SAFE_FALLBACK_ANSWER,
        sources: [],
      };
    }

    // 1. Fetch only ACTIVE and PUBLISHED knowledge entries
    const entries = await db
      .select()
      .from(chatbotKnowledge)
      .where(and(eq(chatbotKnowledge.isActive, true), eq(chatbotKnowledge.isPublished, true)));

    if (!entries || entries.length === 0) {
      return {
        matched: false,
        answer: SAFE_FALLBACK_ANSWER,
        sources: [],
      };
    }

    const queryKeywords = extractKeywords(cleanedQuery);

    // 2. Score each knowledge entry
    const scoredEntries = entries.map((entry) => {
      let score = 0;
      const normalizedQuestion = (entry.question || '').trim().toLowerCase();
      const normalizedTitle = (entry.title || '').trim().toLowerCase();
      const normalizedCategory = (entry.category || '').trim().toLowerCase();
      const normalizedAnswer = (entry.answer || '').trim().toLowerCase();

      // A. Exact normalized match with question or title (if non-empty)
      if (
        (normalizedQuestion && cleanedQuery === normalizedQuestion) ||
        (normalizedTitle && cleanedQuery === normalizedTitle)
      ) {
        score += 150;
      }

      // B. Substring inclusion (only if length >= 3 to avoid matching empty strings)
      if (
        (normalizedQuestion.length >= 3 && (cleanedQuery.includes(normalizedQuestion) || normalizedQuestion.includes(cleanedQuery))) ||
        (normalizedTitle.length >= 3 && (cleanedQuery.includes(normalizedTitle) || normalizedTitle.includes(cleanedQuery)))
      ) {
        score += 90;
      }

      // C. Question keyword overlap
      const entryQuestionKeywords = normalizedQuestion ? extractKeywords(normalizedQuestion) : [];
      const entryTitleKeywords = normalizedTitle ? extractKeywords(normalizedTitle) : [];
      const entryAnswerKeywords = normalizedAnswer ? extractKeywords(normalizedAnswer) : [];

      let questionMatches = 0;
      for (const kw of queryKeywords) {
        if (entryQuestionKeywords.includes(kw) || (normalizedQuestion.length >= 3 && normalizedQuestion.includes(kw))) {
          questionMatches++;
          score += 25;
        }
        if (entryTitleKeywords.includes(kw) || (normalizedTitle.length >= 3 && normalizedTitle.includes(kw))) {
          score += 15;
        }
        if (normalizedCategory && normalizedCategory.includes(kw)) {
          score += 10;
        }
        if (entryAnswerKeywords.includes(kw) || (normalizedAnswer.length >= 3 && normalizedAnswer.includes(kw))) {
          score += 5;
        }
      }

      // Proportional bonus if majority of question keywords matched
      if (queryKeywords.length > 0 && questionMatches > 0 && questionMatches === queryKeywords.length) {
        score += 40;
      }

      return {
        entry,
        score,
      };
    });

    // 3. Sort by score descending
    scoredEntries.sort((a, b) => b.score - a.score);

    const best = scoredEntries[0];

    // Minimum confidence threshold to consider a match valid
    // A single topic keyword hit gives >= 25 points; exact/subset match gives 90+
    const CONFIDENCE_THRESHOLD = 20;

    if (!best || best.score < CONFIDENCE_THRESHOLD) {
      return {
        matched: false,
        answer: SAFE_FALLBACK_ANSWER,
        sources: [],
      };
    }

    const matchedSource: ChatbotSourceItem = {
      id: best.entry.id,
      title: best.entry.title || '',
      category: best.entry.category || '',
      question: best.entry.question || '',
    };

    return {
      matched: true,
      answer: best.entry.answer || SAFE_FALLBACK_ANSWER,
      sources: [matchedSource],
    };
  }

  /**
   * Process Chat Message
   * Accepts user question, executes database retrieval, persists conversation & messages.
   */
  async processChat(
    message: string,
    conversationId?: string,
    userId?: string
  ): Promise<ChatbotResponse> {
    const retrieval = await this.findBestMatchingKnowledge(message);

    // Maintain conversation session
    let convId = conversationId;
    try {
      if (!convId) {
        try {
          const [newConv] = await db
            .insert(chatbotConversations)
            .values({
              userId: userId || null,
              title: message.slice(0, 50),
            })
            .returning();
          convId = newConv?.id;
        } catch {
          const [fallbackConv] = await db
            .insert(chatbotConversations)
            .values({
              userId: null,
              title: message.slice(0, 50),
            })
            .returning();
          convId = fallbackConv?.id;
        }
      }

      if (convId) {
        // Save user message
        await db.insert(chatbotMessages).values({
          conversationId: convId,
          role: 'user',
          content: message,
        });

        // Save assistant response with sources
        await db.insert(chatbotMessages).values({
          conversationId: convId,
          role: 'assistant',
          content: retrieval.answer,
          sources: retrieval.sources,
        });
      }
    } catch (e) {
      // Non-critical persistence failure will not fail user chat response
      console.warn('[ChatbotService] Notice persisting conversation:', e);
    }

    return {
      answer: retrieval.answer,
      matched: retrieval.matched,
      sources: retrieval.sources,
      conversationId: convId,
    };
  }

  /**
   * Retrieve message history for a conversation
   */
  async getConversationMessages(conversationId: string): Promise<ChatbotMessageItem[]> {
    const messages = await db
      .select()
      .from(chatbotMessages)
      .where(eq(chatbotMessages.conversationId, conversationId))
      .orderBy(chatbotMessages.createdAt);

    return messages as ChatbotMessageItem[];
  }
}

export const chatbotService = new ChatbotService();
