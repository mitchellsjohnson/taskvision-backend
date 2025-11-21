/**
 * Unit tests for SMS Parser
 */

import { SmsParser } from '../sms.parser';
import { SmsCommand } from '../sms.types';

describe('SmsParser', () => {
  let parser: SmsParser;

  beforeEach(() => {
    parser = new SmsParser();
  });

  describe('HELP command', () => {
    it('should parse HELP command', () => {
      const result = parser.parse('HELP', '+15551234567');
      expect(result).toEqual({
        command: 'HELP' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '0000', // HELP doesn't require ID, defaults to 0000
      });
    });

    it('should parse help in lowercase', () => {
      const result = parser.parse('help', '+15551234567');
      expect(result).toEqual({
        command: 'HELP' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '0000', // HELP doesn't require ID, defaults to 0000
      });
    });
  });

  describe('CLOSE command', () => {
    it('should parse CLOSE command with short code', () => {
      const result = parser.parse('CLOSE a1b2 ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'CLOSE' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        shortCode: 'a1b2',
      });
    });

    it('should parse close in lowercase', () => {
      const result = parser.parse('close xyz9 id:5678', '+15551234567');
      expect(result).toEqual({
        command: 'CLOSE' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '5678',
        shortCode: 'xyz9',
      });
    });

    it('should reject CLOSE without short code', () => {
      const result = parser.parse('CLOSE ID:1234', '+15551234567');
      expect(result).toBeNull();
    });

    it('should reject CLOSE without ID', () => {
      const result = parser.parse('CLOSE a1b2', '+15551234567');
      expect(result).toBeNull();
    });
  });

  describe('EDIT command', () => {
    it('should parse EDIT command with new title', () => {
      const result = parser.parse('EDIT a1b2 "New title" ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'EDIT' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        shortCode: 'a1b2',
        title: 'New title',
      });
    });

    it('should parse EDIT with MIT priority', () => {
      const result = parser.parse('EDIT a1b2 "Updated task" MIT2 ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'EDIT' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        shortCode: 'a1b2',
        title: 'Updated task',
        priority: 2,
        dueDate: undefined,
        isMIT: true,
      });
    });

    it('should parse EDIT with due date', () => {
      const result = parser.parse('EDIT a1b2 "Fix bug" 12/25/2025 ID:1234', '+15551234567');
      expect(result).not.toBeNull();
      expect(result?.command).toBe('EDIT');
      expect(result?.shortCode).toBe('a1b2');
      expect(result?.title).toBe('Fix bug');
      expect(result?.dueDate).toContain('2025-12-25'); // ISO format
    });

    it('should reject EDIT without title', () => {
      const result = parser.parse('EDIT a1b2 ID:1234', '+15551234567');
      expect(result).toBeNull();
    });
  });

  describe('LIST MIT command', () => {
    it('should parse LIST MIT', () => {
      const result = parser.parse('LIST MIT ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'LIST_MIT' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
      });
    });

    it('should parse list mit in lowercase', () => {
      const result = parser.parse('list mit id:1234', '+15551234567');
      expect(result).toEqual({
        command: 'LIST_MIT' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
      });
    });
  });

  describe('LIST ALL command', () => {
    it('should parse LIST ALL', () => {
      const result = parser.parse('LIST ALL ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'LIST_ALL' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
      });
    });
  });

  describe('CREATE command', () => {
    it('should parse CREATE with quoted title', () => {
      const result = parser.parse('"Fix bug in login" MIT1 ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'CREATE' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        title: 'Fix bug in login',
        priority: 1,
        dueDate: undefined,
        isMIT: true,
      });
    });

    it('should parse CREATE with due date', () => {
      const result = parser.parse('"Buy groceries" 12/25/2025 ID:1234', '+15551234567');
      expect(result).not.toBeNull();
      expect(result?.command).toBe('CREATE');
      expect(result?.title).toBe('Buy groceries');
      expect(result?.dueDate).toContain('2025-12-25'); // ISO format
      expect(result?.priority).toBe(1); // Defaults to MIT1
    });

    it('should parse CREATE with priority and date', () => {
      const result = parser.parse('"Deploy feature" MIT2 12/31/2025 ID:1234', '+15551234567');
      expect(result).not.toBeNull();
      expect(result?.command).toBe('CREATE');
      expect(result?.title).toBe('Deploy feature');
      expect(result?.priority).toBe(2);
      expect(result?.dueDate).toContain('2025-12-31'); // ISO format
    });

    it('should parse CREATE with just title and ID', () => {
      const result = parser.parse('"Simple task" ID:1234', '+15551234567');
      expect(result).not.toBeNull();
      expect(result?.command).toBe('CREATE');
      expect(result?.title).toBe('Simple task');
      expect(result?.priority).toBe(1); // Defaults to MIT1
    });

    it('should reject CREATE without ID', () => {
      const result = parser.parse('"Task without ID" MIT1', '+15551234567');
      expect(result).toBeNull();
    });

    it('should parse CREATE with MIT as title (edge case)', () => {
      const result = parser.parse('MIT1 ID:1234', '+15551234567');
      expect(result).toEqual({
        command: 'CREATE' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        title: 'MIT1',
        priority: 1,
        dueDate: undefined,
        isMIT: true,
      });
    });
  });

  describe('Invalid commands', () => {
    it('should return null for empty message', () => {
      const result = parser.parse('', '+15551234567');
      expect(result).toBeNull();
    });

    it('should return null for whitespace only', () => {
      const result = parser.parse('   ', '+15551234567');
      expect(result).toBeNull();
    });

    it('should return null for unknown command', () => {
      const result = parser.parse('UNKNOWN COMMAND', '+15551234567');
      expect(result).toBeNull();
    });

    it('should return null for malformed command', () => {
      const result = parser.parse('CLOSE ID:1234', '+15551234567'); // missing short code
      expect(result).toBeNull();
    });

    it('should reject SMS key with more than 4 digits', () => {
      const result = parser.parse('"Test task" MIT1 ID:80821', '+15551234567'); // 5 digits
      expect(result).toBeNull();
    });

    it('should reject SMS key with less than 4 digits', () => {
      const result = parser.parse('"Test task" MIT1 ID:808', '+15551234567'); // 3 digits
      expect(result).toBeNull();
    });
  });

  describe('Special characters and edge cases', () => {
    it('should handle titles with special characters', () => {
      const result = parser.parse('"Fix bug: auth failure!" MIT1 ID:1234', '+15551234567');
      expect(result).not.toBeNull();
      expect(result?.title).toBe('Fix bug: auth failure!');
    });

    it('should handle extra whitespace', () => {
      const result = parser.parse('  CLOSE   a1b2   ID:1234  ', '+15551234567');
      expect(result).toEqual({
        command: 'CLOSE' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        shortCode: 'a1b2',
      });
    });

    it('should handle mixed case commands', () => {
      const result = parser.parse('ClOsE a1b2 Id:1234', '+15551234567');
      expect(result).toEqual({
        command: 'CLOSE' as SmsCommand,
        phoneNumber: '+15551234567',
        smsKey: '1234',
        shortCode: 'a1b2',
      });
    });
  });
});
