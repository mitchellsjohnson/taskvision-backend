/**
 * SMS Debug Router
 *
 * Development-only endpoints for testing SMS functionality.
 * Only available when ENABLE_SMS_DEBUG=true and to ecosystem-admin users.
 */

import { Request, Response, Router } from 'express';
import { validateAccessToken } from '../middleware/auth0.middleware';
import { getUserId } from '../middleware/get-user-id';
import { getMockSmsMessages, clearMockSmsMessages, storeMockSmsMessage } from './sms-settings.operations';
import { smsService } from '../sms/sms.service';
import { smsParser } from '../sms/sms.parser';
import { smsValidator } from '../sms/sms.validator';
import { smsFormatter } from '../sms/sms.formatter';
import { shortCodeService } from '../sms/short-code.service';
import { createTask, getTask, updateTask, getTasksForUser } from '../db/task-operations';

const router = Router();

const ENABLE_SMS_DEBUG = process.env.ENABLE_SMS_DEBUG === 'true';
const IS_OFFLINE = process.env.IS_OFFLINE === 'true';

/**
 * Middleware to check if SMS debug is enabled
 */
function requireSmsDebugEnabled(req: Request, res: Response, next: any) {
  if (!ENABLE_SMS_DEBUG && !IS_OFFLINE) {
    return res.status(404).json({
      success: false,
      error: 'Not found',
    });
  }
  next();
}

/**
 * Middleware to check for ecosystem-admin role
 * Note: In local dev with DISABLE_AUTH=true, this is bypassed
 */
function requireEcosystemAdmin(req: Request, res: Response, next: any) {
  // In local dev with auth disabled, allow all requests
  if (process.env.DISABLE_AUTH === 'true') {
    return next();
  }

  // Check for ecosystem-admin role in Auth0 token
  const permissions = (req as any).auth?.permissions || [];
  const roles = (req as any).auth?.['https://taskvision.app/roles'] || [];

  if (!roles.includes('ecosystem-admin')) {
    return res.status(403).json({
      success: false,
      error: 'Requires ecosystem-admin role',
    });
  }

  next();
}

/**
 * GET /api/dev/sms-messages
 * Get all mock SMS messages
 */
router.get(
  '/sms-messages',
  validateAccessToken,
  requireSmsDebugEnabled,
  requireEcosystemAdmin,
  async (req: Request, res: Response) => {
    try {
      const messages = getMockSmsMessages();

      res.json({
        success: true,
        data: {
          messages,
          count: messages.length,
        },
      });
    } catch (error) {
      console.error('Error fetching mock SMS messages:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/dev/sms-messages/clear
 * Clear all mock SMS messages
 */
router.post(
  '/sms-messages/clear',
  validateAccessToken,
  requireSmsDebugEnabled,
  requireEcosystemAdmin,
  async (req: Request, res: Response) => {
    try {
      clearMockSmsMessages();

      res.json({
        success: true,
        message: 'Mock SMS messages cleared',
      });
    } catch (error) {
      console.error('Error clearing mock SMS messages:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

/**
 * POST /api/dev/sms-simulate
 * Simulate an incoming SMS message
 *
 * Body: {
 *   from: string (phone number),
 *   body: string (message content)
 * }
 */
router.post(
  '/sms-simulate',
  validateAccessToken,
  requireSmsDebugEnabled,
  requireEcosystemAdmin,
  async (req: Request, res: Response) => {
    try {
      const { from, body } = req.body;

      // Validation
      if (!from || !body) {
        return res.status(400).json({
          success: false,
          error: 'Both "from" and "body" are required',
        });
      }

      // Validate phone format
      const e164Regex = /^\+[1-9]\d{1,14}$/;
      if (!e164Regex.test(from)) {
        return res.status(400).json({
          success: false,
          error: 'Phone number must be in E.164 format (e.g., +15551234567)',
        });
      }

      // Store the simulated SMS message (for debug log)
      storeMockSmsMessage(from, body, 'inbound');

      // Process the SMS command through the actual pipeline (without sending SMS)
      const timestamp = new Date().toISOString();
      let responseMessage: string;
      let success = false;
      let userId: string | undefined;

      // Helper to safely log audit (ignore errors in local dev)
      const safeAuditLog = async (...args: Parameters<typeof smsValidator.createAuditLog>) => {
        try {
          await smsValidator.createAuditLog(...args);
        } catch (error) {
          console.log('[Audit Log] Skipped (local dev):', error instanceof Error ? error.message : 'Unknown error');
        }
      };

      try {
        // 1. Parse command
        const command = smsParser.parse(body, from);

        if (!command) {
          responseMessage = smsFormatter.formatError('Invalid format. Reply HELP for commands');
          await safeAuditLog(from, body, 'CREATE', 'Error', undefined, 'Parse failed');
        } else if (command.command === 'HELP') {
          responseMessage = smsFormatter.formatHelp();
          success = true;
          await safeAuditLog(from, body, 'HELP', 'Success');
        } else {
          // 2. Validate credentials
          console.log('[SMS Debug] Validating credentials:', { from, smsKey: command.smsKey });
          const validation = await smsValidator.validateCredentials(from, command.smsKey);
          console.log('[SMS Debug] Validation result:', validation);

          if (!validation.valid) {
            responseMessage = smsFormatter.formatError('Unauthorized. Check your ID in Settings');
            await safeAuditLog(from, body, command.command, 'Unauthorized', undefined, validation.error);
          } else {
            userId = validation.userId!;
            console.log('[SMS Debug] User validated:', userId);

            // 3. Execute command
            switch (command.command) {
              case 'CREATE': {
                const { code } = await shortCodeService.generateUniqueCode(userId);

                // Use the isMIT flag from the parser
                const isMIT = command.isMIT !== undefined ? command.isMIT : true; // default to MIT if not specified

                // Get current active tasks to calculate correct combined position
                const allTasks = (await getTasksForUser(userId)) || [];
                const activeTasks = allTasks.filter(t => t.status === 'Open');
                const mitTasks = activeTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
                const litTasks = activeTasks.filter(t => !t.isMIT).sort((a, b) => a.priority - b.priority);

                // Calculate the desired priority within the MIT or LIT list
                let desiredPriority = command.priority || 1;

                console.log('[SMS Debug - CREATE] Parsed command:', {
                  title: command.title,
                  priority: command.priority,
                  isMIT,
                  mitTaskCount: mitTasks.length,
                  litTaskCount: litTasks.length,
                });

                // Calculate the COMBINED position for reprioritizeTasks
                // reprioritizeTasks operates on [MIT tasks][LIT tasks] combined array
                let combinedPosition: number;

                if (isMIT) {
                  // For MIT: position in combined list is just the MIT position - 1 (0-indexed)
                  // Cap at MIT list size to append to end if beyond current MIT tasks
                  combinedPosition = Math.min(desiredPriority - 1, mitTasks.length);
                } else {
                  // For LIT: position is AFTER all MIT tasks
                  // Don't cap - allow inserting at any position, will append to end if beyond current tasks
                  combinedPosition = mitTasks.length + (desiredPriority - 1);
                }

                console.log('[SMS Debug - CREATE] Position calculation:', {
                  desiredPriority,
                  combinedPosition,
                  willInsertAtIndex: combinedPosition,
                });

                // Create task using createTask with insertPosition parameter
                const taskData = {
                  title: command.title!,
                  description: '',
                  dueDate: command.dueDate || undefined,
                  status: 'Open' as const,
                  isMIT,
                  priority: 1, // This will be overridden by reprioritizeTasks
                  tags: [],
                  shortCode: code,
                  insertPosition: combinedPosition, // Use our calculated position
                };

                const task = await createTask(userId, taskData);

                // Debug: Check final task order
                const finalTasks = (await getTasksForUser(userId)) || [];
                const finalActiveTasks = finalTasks.filter(t => t.status === 'Open');
                const finalMitTasks = finalActiveTasks.filter(t => t.isMIT).sort((a, b) => a.priority - b.priority);
                const finalLitTasks = finalActiveTasks.filter(t => t.isMIT === false).sort((a, b) => a.priority - b.priority);

                console.log('[SMS Debug - CREATE] Final LIT task order:', finalLitTasks.map((t, idx) => ({
                  index: idx,
                  priority: t.priority,
                  title: t.title.substring(0, 30),
                  isNewTask: t.TaskId === task.TaskId,
                })));

                responseMessage = smsFormatter.formatCreateSuccess(task);
                success = true;
                await safeAuditLog(from, body, 'CREATE', 'Success', userId, undefined, responseMessage.length);
                break;
              }

              case 'CLOSE': {
                const taskId = await shortCodeService.lookupTaskByCode(command.shortCode!, userId);

                if (!taskId) {
                  responseMessage = smsFormatter.formatError('Task code not found');
                  await safeAuditLog(from, body, 'CLOSE', 'Error', userId, 'Task not found');
                } else {
                  const task = await getTask(userId, taskId);

                  if (!task) {
                    responseMessage = smsFormatter.formatError('Task not found');
                    await safeAuditLog(from, body, 'CLOSE', 'Error', userId, 'Task not found in DB');
                  } else {
                    await updateTask(userId, taskId, {
                      status: 'Completed',
                      completedDate: new Date().toISOString(),
                    });

                    responseMessage = smsFormatter.formatCloseSuccess(command.shortCode!, task.title);
                    success = true;
                    await safeAuditLog(from, body, 'CLOSE', 'Success', userId, undefined, responseMessage.length);
                  }
                }
                break;
              }

              case 'EDIT': {
                const taskId = await shortCodeService.lookupTaskByCode(command.shortCode!, userId);

                if (!taskId) {
                  responseMessage = smsFormatter.formatError('Task code not found');
                  await safeAuditLog(from, body, 'EDIT', 'Error', userId, 'Task not found');
                } else {
                  const updateData: any = {};
                  if (command.title) updateData.title = command.title;
                  if (command.priority) updateData.priority = command.priority;
                  if (command.dueDate) updateData.dueDate = command.dueDate;

                  const updatedTask = await updateTask(userId, taskId, updateData);
                  responseMessage = smsFormatter.formatEditSuccess(updatedTask!);
                  success = true;
                  await safeAuditLog(from, body, 'EDIT', 'Success', userId, undefined, responseMessage.length);
                }
                break;
              }

              case 'LIST_MIT': {
                const allTasks = ((await getTasksForUser(userId)) || []) as any[];
                const mitTasks = allTasks.filter(t => t.isMIT && t.status === 'Open');

                responseMessage = smsFormatter.formatListMitResponse(mitTasks as any);
                success = true;
                await safeAuditLog(from, body, 'LIST_MIT', 'Success', userId, undefined, responseMessage.length);
                break;
              }

              case 'LIST_ALL': {
                const allTasks = ((await getTasksForUser(userId)) || []) as any[];
                const openTasks = allTasks.filter(t => t.status === 'Open');
                const mitTasks = openTasks.filter(t => t.isMIT);
                const litTasks = openTasks.filter(t => !t.isMIT);

                responseMessage = smsFormatter.formatListResponse(mitTasks as any, litTasks as any);
                success = true;
                await safeAuditLog(from, body, 'LIST_ALL', 'Success', userId, undefined, responseMessage.length);
                break;
              }

              default:
                responseMessage = smsFormatter.formatError('Unknown command');
                await safeAuditLog(from, body, command.command, 'Error', userId, 'Unknown command');
            }
          }
        }
      } catch (error) {
        console.error('[SMS Debug] Error processing simulated SMS:', error);
        if (error instanceof Error) {
          console.error('[SMS Debug] Error stack:', error.stack);
        }
        responseMessage = smsFormatter.formatError('Error processing. Try again later');
        await safeAuditLog(
          from,
          body,
          'CREATE',
          'Error',
          userId,
          error instanceof Error ? error.message : 'Unknown error'
        );
      }

      // Store the response message in the mock log
      storeMockSmsMessage(from, responseMessage, 'outbound');

      res.json({
        success,
        message: 'SMS processed',
        data: {
          from,
          body,
          result: responseMessage,
          timestamp,
        },
      });
    } catch (error) {
      console.error('Error simulating SMS:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error',
      });
    }
  }
);

export { router as smsDebugRouter };
