import { describe, it, expect } from 'vitest';
import { extractKeywords, SAFE_FALLBACK_ANSWER } from '../modules/chatbot/chatbot.service';
import {
  CreateChatbotKnowledgeSchema,
  UpdateChatbotKnowledgeSchema,
  ChatbotMessageQuerySchema,
} from '@crm/validation';

describe('Chatbot Unit Test Suite', () => {
  it('1. Extracts and normalizes meaningful keywords while stripping stop words', () => {
    const query = 'What is the standard warranty period for RO service?';
    const keywords = extractKeywords(query);

    expect(keywords).toContain('standard');
    expect(keywords).toContain('warranty');
    expect(keywords).toContain('period');
    expect(keywords).toContain('ro');
    expect(keywords).toContain('service');

    // Verify stop words were omitted
    expect(keywords).not.toContain('what');
    expect(keywords).not.toContain('is');
    expect(keywords).not.toContain('the');
    expect(keywords).not.toContain('for');
  });

  it('2. Correctly handles Hindi/Hinglish stop words and special characters', () => {
    const query = 'RO machine ka price kya hai? ₹500';
    const keywords = extractKeywords(query);

    expect(keywords).toContain('ro');
    expect(keywords).toContain('machine');
    expect(keywords).toContain('price');
    expect(keywords).toContain('500');

    expect(keywords).not.toContain('ka');
    expect(keywords).not.toContain('kya');
    expect(keywords).not.toContain('hai');
  });

  it('3. Validates CreateChatbotKnowledgeSchema allows all fields optional (Cases 1-6)', () => {
    // CASE 1: All fields empty
    const case1 = CreateChatbotKnowledgeSchema.safeParse({
      title: '',
      category: '',
      question: '',
      answer: '',
    });
    expect(case1.success).toBe(true);

    // CASE 2: Title only ("Customer")
    const case2 = CreateChatbotKnowledgeSchema.safeParse({
      title: 'Customer',
      category: '',
      question: '',
      answer: '',
    });
    expect(case2.success).toBe(true);
    if (case2.success) {
      expect(case2.data.title).toBe('Customer');
    }

    // CASE 3: Category only ("Customers")
    const case3 = CreateChatbotKnowledgeSchema.safeParse({
      title: '',
      category: 'Customers',
      question: '',
      answer: '',
    });
    expect(case3.success).toBe(true);
    if (case3.success) {
      expect(case3.data.category).toBe('Customers');
    }

    // CASE 4: Question only ("How do I add a customer?")
    const case4 = CreateChatbotKnowledgeSchema.safeParse({
      title: '',
      category: '',
      question: 'How do I add a customer?',
      answer: '',
    });
    expect(case4.success).toBe(true);
    if (case4.success) {
      expect(case4.data.question).toBe('How do I add a customer?');
    }

    // CASE 5: Answer only ("Customers can be added from the Customers module.")
    const case5 = CreateChatbotKnowledgeSchema.safeParse({
      title: '',
      category: '',
      question: '',
      answer: 'Customers can be added from the Customers module.',
    });
    expect(case5.success).toBe(true);
    if (case5.success) {
      expect(case5.data.answer).toBe('Customers can be added from the Customers module.');
    }

    // CASE 6: All fields populated
    const case6 = CreateChatbotKnowledgeSchema.safeParse({
      title: 'RO Installation Policy',
      category: 'Installation',
      question: 'How long does RO installation take?',
      answer: 'Standard installation is completed within 24 to 48 hours of order confirmation.',
      isActive: true,
    });
    expect(case6.success).toBe(true);
  });

  it('4. Validates ChatbotMessageQuerySchema prevents empty queries', () => {
    const emptyQuery = ChatbotMessageQuerySchema.safeParse({
      message: '   ',
    });
    expect(emptyQuery.success).toBe(false);

    const validQuery = ChatbotMessageQuerySchema.safeParse({
      message: 'What is our service charge?',
    });
    expect(validQuery.success).toBe(true);
    if (validQuery.success) {
      expect(validQuery.data.message).toBe('What is our service charge?');
    }
  });

  it('5. Safe fallback answer contains official customer support message', () => {
    expect(SAFE_FALLBACK_ANSWER).toContain('Enterprises CRM');
    expect(SAFE_FALLBACK_ANSWER).toContain('customer support');
  });
});
