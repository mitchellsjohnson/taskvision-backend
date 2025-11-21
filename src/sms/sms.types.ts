/**
 * SMS Interface Types for TaskVision
 *
 * Defines all types used in SMS command processing, validation, and responses.
 */

export type SmsCommand = 'CREATE' | 'CLOSE' | 'EDIT' | 'LIST_MIT' | 'LIST_ALL' | 'HELP';

export interface ParsedSmsCommand {
  command: SmsCommand;
  smsKey: string;              // 4-digit ID from message
  phoneNumber: string;         // E.164 format sender phone

  // Command-specific fields
  title?: string;              // CREATE, EDIT
  priority?: number;           // CREATE, EDIT (1, 2, 3, 4, ...)
  isMIT?: boolean;             // CREATE, EDIT (true if MIT specified, false if LIT)
  dueDate?: string;            // CREATE, EDIT (MM/DD/YYYY)
  shortCode?: string;          // CLOSE, EDIT
}

export interface SmsValidationResult {
  valid: boolean;
  error?: string;
  userId?: string;             // Resolved from phone + smsKey
}

export interface SmsRateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime?: string;          // ISO timestamp when limit resets
}

export interface AuditLog {
  PK: string;                  // AUDIT#{phoneNumber}
  SK: string;                  // SMS#{timestamp}
  logId: string;
  timestamp: string;           // ISO 8601
  phoneNumber: string;
  rawMessage: string;
  action: SmsCommand;
  result: 'Success' | 'Error' | 'Unauthorized' | 'RateLimited';
  userId?: string;
  errorMessage?: string;
  responseLength?: number;
}

export interface RateLimitEntry {
  PK: string;                  // RATELIMIT#{phoneNumber}
  SK: string;                  // SMS#{timestamp}
  TTL: number;                 // Unix epoch + 3600 (1 hour)
  count: number;
}

export interface SmsResponse {
  success: boolean;
  message: string;             // GSM-7 encoded, < 250 characters
  timestamp: string;
}

// SNS Event from Pinpoint
export interface PinpointSnsEvent {
  Records: Array<{
    EventSource: string;
    EventVersion: string;
    EventSubscriptionArn: string;
    Sns: {
      Type: string;
      MessageId: string;
      TopicArn: string;
      Subject?: string;
      Message: string;          // JSON string containing Pinpoint event
      Timestamp: string;
      SignatureVersion: string;
      Signature: string;
      SigningCertURL: string;
      UnsubscribeURL: string;
      MessageAttributes: Record<string, any>;
    };
  }>;
}

// Parsed Pinpoint SMS event
export interface PinpointSmsEvent {
  messageBody: string;
  originationNumber: string;   // Sender's phone number
  destinationNumber: string;   // TaskVision's Pinpoint number
  messageId: string;
  inboundMessageId: string;
  previousPublishedMessageId?: string;
  messageType: string;
  messageRequestTimestamp: string;
}

// TaskVision API Auth0 M2M Token Response
export interface Auth0TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

// Short code generation result
export interface ShortCodeResult {
  code: string;
  attempts: number;            // Number of collision retries
}
