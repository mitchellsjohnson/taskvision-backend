/**
 * SMS Command Parser
 *
 * Parses incoming SMS messages into structured commands.
 * Supports: CREATE, CLOSE, EDIT, LIST MIT, LIST ALL, HELP
 */

import { ParsedSmsCommand, SmsCommand } from './sms.types';

export class SmsParser {
  /**
   * Parse MIT level from string (MIT1, MIT2, MIT3)
   * Returns priority number (1, 2, or 3)
   */
  private parseMitLevel(mitString: string): number {
    const match = mitString.match(/MIT([123])/i);
    return match ? parseInt(match[1], 10) : 1; // Default to MIT1
  }

  /**
   * Parse date from MM/DD/YYYY or MM/DD format to YYYY-MM-DD string
   * If year is omitted, assumes current year
   * Returns date string in YYYY-MM-DD format or null if invalid
   */
  private parseDate(dateString: string): string | null {
    // Try full format first: MM/DD/YYYY
    let match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    let month: string, day: string, year: string;

    if (match) {
      [, month, day, year] = match;
    } else {
      // Try short format: MM/DD (assume current year)
      match = dateString.match(/^(\d{1,2})\/(\d{1,2})$/);
      if (!match) return null;

      [, month, day] = match;
      year = new Date().getFullYear().toString();
    }

    const formattedDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

    // Validate date is valid
    const date = new Date(formattedDate);
    if (isNaN(date.getTime())) return null;

    // Return YYYY-MM-DD format (not full ISO with timestamp)
    return formattedDate;
  }

  /**
   * Extract ID (smsKey) from message
   * Format: ID:1234 or ID: 1234 (exactly 4 digits)
   */
  private extractSmsKey(message: string): string | null {
    // Match ID: followed by exactly 4 digits with word boundary
    const match = message.match(/ID:\s*(\d{4})\b/i);
    return match ? match[1] : null;
  }

  /**
   * Extract quoted title from message
   * Returns null if no quotes found
   */
  private extractQuotedTitle(message: string): string | null {
    const match = message.match(/"([^"]+)"/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract title using smart parsing - everything before MIT/LIT/ID markers
   * Returns null if can't extract a valid title
   */
  private extractSmartTitle(message: string): string | null {
    // Remove everything from the first occurrence of MIT, LIT, or ID onwards
    const match = message.match(/^(.+?)(?:\s+(?:MIT|LIT)\d|\s+ID:)/i);
    if (!match) return null;

    const title = match[1].trim();

    // Ensure title is not empty and doesn't start with a command keyword
    if (!title || /^(CLOSE|EDIT|LIST|HELP)\b/i.test(title)) {
      return null;
    }

    return title;
  }

  /**
   * Parse CREATE command
   * Format 1: "Task Title" MIT3 12/02/2025 ID:1234 (quoted)
   * Format 2: Task Title MIT3 12/02/2025 ID:1234 (unquoted, smart parsing)
   * Format 3: "Task Title" ID:1234  (defaults: MIT1, no due date)
   */
  private parseCreate(message: string, phoneNumber: string): ParsedSmsCommand | null {
    const smsKey = this.extractSmsKey(message);
    if (!smsKey) return null;

    // Try quoted title first, then smart parsing
    let title = this.extractQuotedTitle(message);
    if (!title) {
      title = this.extractSmartTitle(message);
    }

    if (!title) return null;

    // Extract MIT/LIT level (optional, defaults to MIT1)
    // Support both MIT1-3 and LIT1-N
    const mitMatch = message.match(/MIT([123])/i);
    const litMatch = message.match(/LIT(\d+)/i);

    let priority = 1; // default MIT1
    let isMIT = true; // default to MIT

    if (mitMatch) {
      priority = parseInt(mitMatch[1], 10); // MIT1=1, MIT2=2, MIT3=3
      isMIT = true;
    } else if (litMatch) {
      // LIT tasks have their own numbering: LIT1=1, LIT2=2, etc.
      priority = parseInt(litMatch[1], 10);
      isMIT = false;
    }

    // Extract due date (optional) - supports both MM/DD/YYYY and MM/DD formats
    const dateMatch = message.match(/(\d{1,2}\/\d{1,2}(?:\/\d{4})?)/);
    const dueDate = dateMatch ? this.parseDate(dateMatch[1]) : null;

    return {
      command: 'CREATE',
      smsKey,
      phoneNumber,
      title,
      priority,
      isMIT,
      dueDate: dueDate || undefined,
    };
  }

  /**
   * Parse CLOSE command
   * Format: CLOSE a1b2 ID:1234
   */
  private parseClose(message: string, phoneNumber: string): ParsedSmsCommand | null {
    const smsKey = this.extractSmsKey(message);
    if (!smsKey) return null;

    // Extract short code (4-6 alphanumeric characters)
    const codeMatch = message.match(/CLOSE\s+([a-z0-9]{4,6})/i);
    if (!codeMatch) return null;

    return {
      command: 'CLOSE',
      smsKey,
      phoneNumber,
      shortCode: codeMatch[1].toLowerCase(),
    };
  }

  /**
   * Parse EDIT command
   * Format: EDIT a1b2 "New Title" MIT2 12/03/2025 ID:1234
   * Format: EDIT a1b2 "New Title" ID:1234  (keeps existing MIT/date)
   * Format: EDIT a1b2 MIT2 ID:1234  (only update MIT)
   */
  private parseEdit(message: string, phoneNumber: string): ParsedSmsCommand | null {
    const smsKey = this.extractSmsKey(message);
    if (!smsKey) return null;

    // Extract short code
    const codeMatch = message.match(/EDIT\s+([a-z0-9]{4,6})/i);
    if (!codeMatch) return null;

    const shortCode = codeMatch[1].toLowerCase();

    // Extract optional title
    const title = this.extractQuotedTitle(message) || undefined;

    // Extract optional MIT/LIT level
    const mitMatch = message.match(/MIT([123])/i);
    const litMatch = message.match(/LIT(\d+)/i);

    let priority: number | undefined = undefined;
    let isMIT: boolean | undefined = undefined;

    if (mitMatch) {
      priority = parseInt(mitMatch[1], 10);
      isMIT = true;
    } else if (litMatch) {
      priority = parseInt(litMatch[1], 10);
      isMIT = false;
    }

    // Extract optional due date
    const dateMatch = message.match(/(\d{1,2}\/\d{1,2}\/\d{4})/);
    const dueDate = dateMatch ? this.parseDate(dateMatch[1]) : undefined;

    // Must have at least one field to update
    if (!title && !priority && !dueDate) return null;

    return {
      command: 'EDIT',
      smsKey,
      phoneNumber,
      shortCode,
      title,
      priority,
      isMIT,
      dueDate: dueDate || undefined,
    };
  }

  /**
   * Parse LIST MIT command
   * Format: LIST MIT ID:1234
   */
  private parseListMit(message: string, phoneNumber: string): ParsedSmsCommand | null {
    const smsKey = this.extractSmsKey(message);
    if (!smsKey) return null;

    if (!/LIST\s+MIT/i.test(message)) return null;

    return {
      command: 'LIST_MIT',
      smsKey,
      phoneNumber,
    };
  }

  /**
   * Parse LIST ALL command
   * Format: LIST ALL ID:1234
   */
  private parseListAll(message: string, phoneNumber: string): ParsedSmsCommand | null {
    const smsKey = this.extractSmsKey(message);
    if (!smsKey) return null;

    if (!/LIST\s+ALL/i.test(message)) return null;

    return {
      command: 'LIST_ALL',
      smsKey,
      phoneNumber,
    };
  }

  /**
   * Parse HELP command
   * Format: HELP ID:1234 or just HELP
   */
  private parseHelp(message: string, phoneNumber: string): ParsedSmsCommand | null {
    if (!/^HELP/i.test(message.trim())) return null;

    const smsKey = this.extractSmsKey(message);

    return {
      command: 'HELP',
      smsKey: smsKey || '0000', // HELP doesn't require ID
      phoneNumber,
    };
  }

  /**
   * Main parse method - attempts to parse message as any supported command
   *
   * @param message - Raw SMS message body
   * @param phoneNumber - Sender's phone number (E.164 format)
   * @returns ParsedSmsCommand or null if parsing fails
   */
  parse(message: string, phoneNumber: string): ParsedSmsCommand | null {
    const trimmedMessage = message.trim();

    // Try parsing as each command type in order of specificity
    if (trimmedMessage.match(/^HELP/i)) {
      return this.parseHelp(trimmedMessage, phoneNumber);
    }

    if (trimmedMessage.match(/^CLOSE/i)) {
      return this.parseClose(trimmedMessage, phoneNumber);
    }

    if (trimmedMessage.match(/^EDIT/i)) {
      return this.parseEdit(trimmedMessage, phoneNumber);
    }

    if (trimmedMessage.match(/^LIST\s+MIT/i)) {
      return this.parseListMit(trimmedMessage, phoneNumber);
    }

    if (trimmedMessage.match(/^LIST\s+ALL/i)) {
      return this.parseListAll(trimmedMessage, phoneNumber);
    }

    // Default: try parsing as CREATE (implicit command)
    // Works with both quoted titles and smart parsing
    if (this.extractSmsKey(trimmedMessage)) {
      return this.parseCreate(trimmedMessage, phoneNumber);
    }

    // Unable to parse
    return null;
  }

  /**
   * Get help text for SMS commands
   */
  getHelpText(): string {
    return `TaskVision SMS Commands:

CREATE: "Title" MIT1 12/25/2025 ID:1234
CLOSE: CLOSE a1b2 ID:1234
EDIT: EDIT a1b2 "New Title" MIT2 ID:1234
LIST: LIST MIT ID:1234 or LIST ALL ID:1234

Get your ID in Settings > SMS`;
  }
}

// Export singleton instance
export const smsParser = new SmsParser();
