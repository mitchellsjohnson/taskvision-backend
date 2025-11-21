/**
 * SMS Service
 *
 * Main orchestration service for SMS command processing.
 * Handles:
 * - Command parsing and validation
 * - Task operations via TaskVision API
 * - Response formatting and sending
 */

import { smsParser } from './sms.parser';
import { smsValidator } from './sms.validator';
import { smsFormatter } from './sms.formatter';
import { shortCodeService } from './short-code.service';
import { ParsedSmsCommand, SmsResponse, Auth0TokenResponse } from './sms.types';
import { Task } from '../types';
import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from '@aws-sdk/client-pinpoint-sms-voice-v2';

const API_URL = process.env.TASKVISION_API_URL || 'http://localhost:8000';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;
const EUM_CONFIGURATION_SET = process.env.EUM_CONFIGURATION_SET || 'default';
const EUM_ORIGINATION_NUMBER = process.env.EUM_ORIGINATION_NUMBER;

export class SmsService {
  private smsClient: PinpointSMSVoiceV2Client;
  private m2mToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.smsClient = new PinpointSMSVoiceV2Client({});
  }

  /**
   * Get Auth0 M2M token for API calls
   */
  private async getM2MToken(): Promise<string> {
    // Return cached token if still valid
    const now = Math.floor(Date.now() / 1000);
    if (this.m2mToken && this.tokenExpiry > now + 300) {
      // 5 min buffer
      return this.m2mToken;
    }

    try {
      const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: AUTH0_CLIENT_ID,
          client_secret: AUTH0_CLIENT_SECRET,
          audience: AUTH0_AUDIENCE,
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        throw new Error(`Auth0 token request failed: ${response.statusText}`);
      }

      const data: Auth0TokenResponse = await response.json();
      this.m2mToken = data.access_token;
      this.tokenExpiry = now + data.expires_in;

      return this.m2mToken;
    } catch (error) {
      console.error('Error getting M2M token:', error);
      throw new Error('Authentication failed');
    }
  }

  /**
   * Make authenticated API call to TaskVision backend
   */
  private async apiCall<T>(
    method: string,
    endpoint: string,
    userId: string,
    body?: any
  ): Promise<T> {
    const token = await this.getM2MToken();

    const response = await fetch(`${API_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-User-Id': userId, // Pass userId for impersonation
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Handle CREATE command
   */
  private async handleCreate(cmd: ParsedSmsCommand, userId: string): Promise<string> {
    console.log('[SMS handleCreate] Starting with command:', { title: cmd.title, priority: cmd.priority, isMIT: cmd.isMIT });

    // Generate short code
    const { code } = await shortCodeService.generateUniqueCode(userId);
    console.log('[SMS handleCreate] Generated short code:', code);

    // Use the isMIT flag from the parser
    const isMIT = cmd.isMIT !== undefined ? cmd.isMIT : true; // default to MIT if not specified

    // Get current active tasks to calculate correct combined position
    const allTasks = await this.apiCall<Task[]>('GET', '/api/tasks?status=Open', userId);
    const mitTasks = allTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
    const litTasks = allTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

    console.log('[SMS handleCreate] Current state:', {
      totalTasks: allTasks.length,
      mitCount: mitTasks.length,
      litCount: litTasks.length,
      mitPriorities: mitTasks.map(t => t.priority),
      litPriorities: litTasks.map(t => t.priority),
    });

    // Calculate the desired priority within the MIT or LIT list
    let desiredPriority = cmd.priority || 1;

    // Calculate the COMBINED position for reprioritizeTasks
    // reprioritizeTasks operates on [MIT tasks][LIT tasks] combined array
    let combinedPosition: number;

    if (isMIT) {
      // For MIT: position in combined list is just the MIT position - 1 (0-indexed)
      // Cap at MIT list size to append to end if beyond current MIT tasks
      combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);
      console.log('[SMS handleCreate] MIT position calc:', { desiredPriority, mitTasksLength: mitTasks.length, combinedPosition });
    } else {
      // For LIT: position is AFTER all MIT tasks
      // Cap at total task count to avoid out-of-bounds
      const litPosition = desiredPriority - 1; // 0-indexed within LIT
      combinedPosition = Math.min(mitTasks.length + litPosition, allTasks.length);
      console.log('[SMS handleCreate] LIT position calc:', { desiredPriority, litPosition, mitTasksLength: mitTasks.length, totalTasks: allTasks.length, combinedPosition });
    }

    // Create task with insertPosition to control exact placement
    const taskData = {
      title: cmd.title!,
      description: '',
      dueDate: cmd.dueDate || null,
      status: 'Open',
      isMIT,
      priority: 1, // Will be overridden by reprioritizeTasks
      tags: [],
      shortCode: code,
      insertPosition: combinedPosition, // Use our calculated position
    };

    console.log('[SMS handleCreate] Creating task with data:', { title: taskData.title, isMIT: taskData.isMIT, insertPosition: taskData.insertPosition, shortCode: taskData.shortCode });
    const task = await this.apiCall<Task>('POST', '/api/tasks', userId, taskData);
    console.log('[SMS handleCreate] Task created:', { TaskId: task.TaskId, priority: task.priority, isMIT: task.isMIT });

    return smsFormatter.formatCreateSuccess(task);
  }

  /**
   * Handle CLOSE command
   */
  private async handleClose(cmd: ParsedSmsCommand, userId: string): Promise<string> {
    // Look up task by short code
    const taskId = await shortCodeService.lookupTaskByCode(cmd.shortCode!, userId);

    if (!taskId) {
      return smsFormatter.formatError('Task code not found');
    }

    // Get task details
    const task = await this.apiCall<Task>('GET', `/api/tasks/${taskId}`, userId);

    // Update task status to Completed
    await this.apiCall('PUT', `/api/tasks/${taskId}`, userId, {
      status: 'Completed',
      completedDate: new Date().toISOString(),
    });

    return smsFormatter.formatCloseSuccess(cmd.shortCode!, task.title);
  }

  /**
   * Handle EDIT command
   */
  private async handleEdit(cmd: ParsedSmsCommand, userId: string): Promise<string> {
    // Look up task by short code
    const taskId = await shortCodeService.lookupTaskByCode(cmd.shortCode!, userId);

    if (!taskId) {
      return smsFormatter.formatError('Task code not found');
    }

    // Build update payload
    const updateData: any = {};
    if (cmd.title) updateData.title = cmd.title;
    if (cmd.priority) updateData.priority = cmd.priority;
    if (cmd.dueDate) updateData.dueDate = cmd.dueDate;

    // Update task via API
    const updatedTask = await this.apiCall<Task>('PUT', `/api/tasks/${taskId}`, userId, updateData);

    return smsFormatter.formatEditSuccess(updatedTask);
  }

  /**
   * Handle LIST MIT command
   */
  private async handleListMit(cmd: ParsedSmsCommand, userId: string): Promise<string> {
    // Fetch MIT tasks
    const tasks = await this.apiCall<Task[]>('GET', '/api/tasks?isMIT=true&status=Open', userId);

    return smsFormatter.formatListMitResponse(tasks);
  }

  /**
   * Handle LIST ALL command
   */
  private async handleListAll(cmd: ParsedSmsCommand, userId: string): Promise<string> {
    // Fetch all open tasks
    const allTasks = await this.apiCall<Task[]>('GET', '/api/tasks?status=Open', userId);

    // Separate MIT and LIT
    const mitTasks = allTasks.filter((t) => t.isMIT);
    const litTasks = allTasks.filter((t) => !t.isMIT);

    return smsFormatter.formatListResponse(mitTasks, litTasks);
  }

  /**
   * Handle HELP command
   */
  private async handleHelp(cmd: ParsedSmsCommand): Promise<string> {
    return smsFormatter.formatHelp();
  }

  /**
   * Send SMS response via AWS End User Messaging SMS and Voice V2
   */
  private async sendSmsResponse(phoneNumber: string, message: string): Promise<void> {
    if (!EUM_ORIGINATION_NUMBER) {
      console.error('EUM origination number not configured');
      throw new Error('SMS configuration error');
    }

    const command = new SendTextMessageCommand({
      DestinationPhoneNumber: phoneNumber,
      OriginationIdentity: EUM_ORIGINATION_NUMBER,
      MessageBody: message,
      MessageType: 'TRANSACTIONAL',
      ConfigurationSetName: EUM_CONFIGURATION_SET,
    });

    await this.smsClient.send(command);
  }

  /**
   * Main processing method
   *
   * @param messageBody - Raw SMS message
   * @param phoneNumber - Sender's phone number (E.164)
   * @returns SmsResponse with success status and message
   */
  async processSmsCommand(messageBody: string, phoneNumber: string): Promise<SmsResponse> {
    const timestamp = new Date().toISOString();

    try {
      // 1. Parse command
      const command = smsParser.parse(messageBody, phoneNumber);

      if (!command) {
        const errorMsg = smsFormatter.formatError('Invalid format. Reply HELP for commands');
        await smsValidator.createAuditLog(phoneNumber, messageBody, 'CREATE', 'Error', undefined, 'Parse failed');
        // Do not send SMS response on error
        return { success: false, message: errorMsg, timestamp };
      }

      // 2. Check rate limit (unless HELP command)
      if (command.command !== 'HELP') {
        const rateLimit = await smsValidator.checkRateLimit(phoneNumber);
        if (!rateLimit.allowed) {
          const errorMsg = smsFormatter.formatError('Limit reached. Try again in 1 hour');
          await smsValidator.createAuditLog(phoneNumber, messageBody, command.command, 'RateLimited');
          // Do not send SMS response on error
          return { success: false, message: errorMsg, timestamp };
        }
      }

      // 3. Validate credentials (unless HELP command)
      let userId: string | undefined;
      if (command.command !== 'HELP') {
        const validation = await smsValidator.validateCredentials(phoneNumber, command.smsKey);

        if (!validation.valid) {
          const errorMsg = smsFormatter.formatError('Unauthorized. Check your ID in Settings');
          await smsValidator.createAuditLog(
            phoneNumber,
            messageBody,
            command.command,
            'Unauthorized',
            undefined,
            validation.error
          );
          // Do not send SMS response on error
          return { success: false, message: errorMsg, timestamp };
        }

        userId = validation.userId;

        // 4. Check daily limit
        const dailyAllowed = await smsValidator.checkDailyLimit(userId!);
        if (!dailyAllowed) {
          const errorMsg = smsFormatter.formatError('Daily limit reached. Try tomorrow');
          await smsValidator.createAuditLog(phoneNumber, messageBody, command.command, 'RateLimited', userId);
          // Do not send SMS response on error
          return { success: false, message: errorMsg, timestamp };
        }

        // 5. Record rate limit entry
        await smsValidator.recordRateLimitEntry(phoneNumber);
      }

      // 6. Execute command
      let responseMessage: string;

      switch (command.command) {
        case 'CREATE':
          responseMessage = await this.handleCreate(command, userId!);
          break;
        case 'CLOSE':
          responseMessage = await this.handleClose(command, userId!);
          break;
        case 'EDIT':
          responseMessage = await this.handleEdit(command, userId!);
          break;
        case 'LIST_MIT':
          responseMessage = await this.handleListMit(command, userId!);
          break;
        case 'LIST_ALL':
          responseMessage = await this.handleListAll(command, userId!);
          break;
        case 'HELP':
          responseMessage = await this.handleHelp(command);
          break;
        default:
          responseMessage = smsFormatter.formatError('Unknown command');
      }

      // 7. Send response
      await this.sendSmsResponse(phoneNumber, responseMessage);

      // 8. Log success
      await smsValidator.createAuditLog(
        phoneNumber,
        messageBody,
        command.command,
        'Success',
        userId,
        undefined,
        responseMessage.length
      );

      return { success: true, message: responseMessage, timestamp };
    } catch (error) {
      console.error('Error processing SMS command:', error);

      const errorMsg = smsFormatter.formatError('Error processing. Try again later');
      await smsValidator.createAuditLog(
        phoneNumber,
        messageBody,
        'CREATE',
        'Error',
        undefined,
        error instanceof Error ? error.message : 'Unknown error'
      );

      // Do not send SMS response on error
      return { success: false, message: errorMsg, timestamp };
    }
  }
}

// Export singleton instance
export const smsService = new SmsService();
