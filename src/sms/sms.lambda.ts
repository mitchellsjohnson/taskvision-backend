/**
 * SMS Processor Lambda Function
 *
 * AWS Lambda handler for processing incoming SMS messages from Amazon Pinpoint via SNS.
 * This is the entry point for the smsProcessor Lambda function.
 */

import { SNSEvent, Context, SNSEventRecord } from 'aws-lambda';
import { smsService } from './sms.service';
import { PinpointSmsEvent } from './sms.types';

/**
 * Parse SNS message from Pinpoint
 *
 * Pinpoint sends SMS events as JSON strings in the SNS Message field.
 */
function parsePinpointEvent(snsRecord: SNSEventRecord): PinpointSmsEvent | null {
  try {
    const message = snsRecord.Sns.Message;
    const pinpointEvent = JSON.parse(message);

    // Pinpoint SMS event structure varies, handle common formats
    // Standard inbound SMS event
    if (pinpointEvent.eventType === 'TEXT_RECEIVED' || pinpointEvent.messageBody) {
      return {
        messageBody: pinpointEvent.messageBody,
        originationNumber: pinpointEvent.originationNumber,
        destinationNumber: pinpointEvent.destinationNumber,
        messageId: pinpointEvent.messageId || pinpointEvent.inboundMessageId,
        inboundMessageId: pinpointEvent.inboundMessageId || pinpointEvent.messageId,
        previousPublishedMessageId: pinpointEvent.previousPublishedMessageId,
        messageType: pinpointEvent.messageType || 'TEXT',
        messageRequestTimestamp: pinpointEvent.messageRequestTimestamp || new Date().toISOString(),
      };
    }

    // Alternative Pinpoint format (varies by configuration)
    if (pinpointEvent.originatingAddress && pinpointEvent.messageBody) {
      return {
        messageBody: pinpointEvent.messageBody,
        originationNumber: pinpointEvent.originatingAddress,
        destinationNumber: pinpointEvent.destinationAddress || process.env.PINPOINT_ORIGINATION_NUMBER!,
        messageId: pinpointEvent.messageId || 'unknown',
        inboundMessageId: pinpointEvent.messageId || 'unknown',
        messageType: 'TEXT',
        messageRequestTimestamp: new Date().toISOString(),
      };
    }

    console.error('Unknown Pinpoint event format:', pinpointEvent);
    return null;
  } catch (error) {
    console.error('Error parsing Pinpoint event:', error);
    return null;
  }
}

/**
 * Lambda handler for SNS events from Pinpoint
 *
 * Processes each SNS record and delegates to SMS service.
 */
export async function handler(event: SNSEvent, context: Context): Promise<any> {
  console.log('SMS Processor Lambda invoked');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));

  const results = [];

  for (const record of event.Records) {
    try {
      // Parse Pinpoint event from SNS message
      const pinpointEvent = parsePinpointEvent(record);

      if (!pinpointEvent) {
        console.error('Failed to parse Pinpoint event from SNS record');
        results.push({
          success: false,
          error: 'Failed to parse Pinpoint event',
        });
        continue;
      }

      console.log('Processing SMS from:', pinpointEvent.originationNumber);
      console.log('Message body:', pinpointEvent.messageBody);

      // Process SMS command
      const result = await smsService.processSmsCommand(
        pinpointEvent.messageBody,
        pinpointEvent.originationNumber
      );

      console.log('Processing result:', result);

      results.push({
        success: result.success,
        phoneNumber: pinpointEvent.originationNumber,
        message: result.message,
        timestamp: result.timestamp,
      });
    } catch (error) {
      console.error('Error processing SNS record:', error);
      results.push({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Return processing results
  // Note: Lambda should return 200 even if individual SMS processing fails
  // to avoid SNS retries for application errors
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'SMS processing complete',
      results,
      processedCount: results.length,
      successCount: results.filter((r) => r.success).length,
    }),
  };
}

/**
 * Health check handler for testing
 */
export async function healthCheck(): Promise<any> {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'SMS Processor Lambda is healthy',
      timestamp: new Date().toISOString(),
      environment: {
        tableNameConfigured: !!process.env.TABLE_NAME,
        auth0Configured: !!process.env.AUTH0_DOMAIN,
        pinpointConfigured: !!process.env.PINPOINT_APP_ID,
        apiUrlConfigured: !!process.env.TASKVISION_API_URL,
      },
    }),
  };
}
