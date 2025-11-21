/**
 * SMS Response Formatter
 *
 * Formats task data into GSM-7 compliant SMS messages under 250 characters.
 * Handles truncation, emoji encoding, and readable date formatting.
 */

import { Task } from '../types';

const MAX_SMS_LENGTH = 250;
const MAX_TITLE_LENGTH = 25;

export class SmsFormatter {
  /**
   * Check if character is GSM-7 safe
   * Replaces unsafe characters with ASCII equivalents
   */
  private sanitizeForGsm7(text: string): string {
    // Common replacements for GSM-7 compatibility
    const replacements: Record<string, string> = {
      '\u2018': "'", // Left single quote
      '\u2019': "'", // Right single quote
      '\u201C': '"', // Left double quote
      '\u201D': '"', // Right double quote
      '\u2013': '-', // En dash
      '\u2014': '-', // Em dash
      '\u2026': '...', // Ellipsis
    };

    let sanitized = text;
    for (const [unicode, ascii] of Object.entries(replacements)) {
      sanitized = sanitized.replace(new RegExp(unicode, 'g'), ascii);
    }

    // Remove any remaining non-GSM-7 characters (keep basic ASCII + emojis)
    sanitized = sanitized.replace(/[^\x00-\x7F\u{1F300}-\u{1F9FF}]/gu, '');

    return sanitized;
  }

  /**
   * Truncate title to max length with ellipsis
   */
  private truncateTitle(title: string, maxLength: number = MAX_TITLE_LENGTH): string {
    if (title.length <= maxLength) return title;
    return title.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format date as MM/DD for display
   */
  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    const month = (date.getMonth() + 1).toString();
    const day = date.getDate().toString();
    return `${month}/${day}`;
  }

  /**
   * Format a single task line
   * Format: 1. [a1b2] Task title (12/25)
   */
  private formatTaskLine(index: number, task: Task): string {
    const shortCode = task.shortCode || 'n/a';
    const title = this.truncateTitle(task.title);
    const dateStr = task.dueDate ? ` (${this.formatDate(task.dueDate)})` : '';

    return `${index}. [${shortCode}] ${title}${dateStr}`;
  }

  /**
   * Format LIST response with MIT and LIT tasks
   *
   * @param mitTasks - All MIT tasks (Most Important Tasks)
   * @param litTasks - Top 3 LIT tasks (Less Important Tasks)
   * @returns Formatted SMS message
   */
  formatListResponse(mitTasks: Task[], litTasks: Task[]): string {
    let message = '';

    // MIT section
    if (mitTasks.length > 0) {
      message += '\uD83D\uDCD8 MIT:\n'; // 📘 emoji
      mitTasks.slice(0, 5).forEach((task, index) => {
        message += this.formatTaskLine(index + 1, task) + '\n';
      });
    } else {
      message += '\uD83D\uDCD8 MIT: None\n';
    }

    message += '\n';

    // LIT section (top 3)
    if (litTasks.length > 0) {
      message += '\uD83D\uDCD7 LIT:\n'; // 📗 emoji
      litTasks.slice(0, 3).forEach((task, index) => {
        message += this.formatTaskLine(index + 1, task) + '\n';
      });
    } else {
      message += '\uD83D\uDCD7 LIT: None\n';
    }

    message += '\nReply EDIT/CLOSE [code]';

    // Sanitize and truncate to max length
    message = this.sanitizeForGsm7(message);

    if (message.length > MAX_SMS_LENGTH) {
      message = message.substring(0, MAX_SMS_LENGTH - 3) + '...';
    }

    return message;
  }

  /**
   * Format LIST MIT response (MIT tasks only)
   */
  formatListMitResponse(mitTasks: Task[]): string {
    let message = '';

    if (mitTasks.length > 0) {
      message += '\uD83D\uDCD8 MIT Tasks:\n';
      mitTasks.slice(0, 10).forEach((task, index) => {
        message += this.formatTaskLine(index + 1, task) + '\n';
      });
      message += '\nReply CLOSE [code] to complete';
    } else {
      message = '\uD83D\uDCD8 No MIT tasks found.\n\nCreate one: "Title" MIT1 ID:1234';
    }

    message = this.sanitizeForGsm7(message);

    if (message.length > MAX_SMS_LENGTH) {
      message = message.substring(0, MAX_SMS_LENGTH - 3) + '...';
    }

    return message;
  }

  /**
   * Format success response for CREATE command
   */
  formatCreateSuccess(task: Task): string {
    const shortCode = task.shortCode || 'n/a';
    const title = this.truncateTitle(task.title);

    let message = `\u2705 Task created: [${shortCode}] ${title}`;

    if (task.isMIT) {
      message += ` (MIT${task.priority})`;
    }

    if (task.dueDate) {
      message += ` - Due ${this.formatDate(task.dueDate)}`;
    }

    return this.sanitizeForGsm7(message);
  }

  /**
   * Format success response for CLOSE command
   */
  formatCloseSuccess(shortCode: string, title: string): string {
    const truncated = this.truncateTitle(title);
    return this.sanitizeForGsm7(`\u2705 Task closed: [${shortCode}] ${truncated}`);
  }

  /**
   * Format success response for EDIT command
   */
  formatEditSuccess(task: Task): string {
    const shortCode = task.shortCode || 'n/a';
    const title = this.truncateTitle(task.title);

    let message = `\u2705 Task updated: [${shortCode}] ${title}`;

    if (task.isMIT) {
      message += ` (MIT${task.priority})`;
    }

    return this.sanitizeForGsm7(message);
  }

  /**
   * Format error responses
   */
  formatError(error: string): string {
    // Truncate error if too long (account for emoji + space)
    const maxErrorLength = MAX_SMS_LENGTH - 2; // Reserve space for emoji and space
    const truncatedError = error.length > maxErrorLength ? error.substring(0, maxErrorLength - 3) + '...' : error;
    const errorMessage = `\u274C ${truncatedError}`;
    return this.sanitizeForGsm7(errorMessage);
  }

  /**
   * Format help response
   */
  formatHelp(): string {
    const help = `TaskVision Commands:

CREATE: "Title" MIT1 12/25/2025 ID:1234
CLOSE: CLOSE a1b2 ID:1234
EDIT: EDIT a1b2 "New" MIT2 ID:1234
LIST: LIST MIT or LIST ALL ID:1234

Get ID: taskvision.com/settings/sms`;

    return this.sanitizeForGsm7(help);
  }

  /**
   * Validate message length is within SMS limits
   */
  validateLength(message: string): boolean {
    return message.length <= MAX_SMS_LENGTH;
  }

  /**
   * Get character count for a message
   */
  getCharacterCount(message: string): number {
    return this.sanitizeForGsm7(message).length;
  }
}

// Export singleton instance
export const smsFormatter = new SmsFormatter();
