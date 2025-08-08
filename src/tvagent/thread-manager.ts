import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ulid } from 'ulid';
import OpenAI from 'openai';
import getClient from '../db/dynamo';

export interface ConversationThread {
  PK: string; // USER#userId
  SK: string; // THREAD#threadId
  EntityType: 'ConversationThread';
  threadId: string;
  openaiThreadId: string;
  title: string;
  lastMessage?: string;
  lastActivity: string;
  messageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationMessage {
  PK: string; // THREAD#threadId  
  SK: string; // MESSAGE#messageId
  EntityType: 'ConversationMessage';
  messageId: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  functionCalled?: string;
  parameters?: any;
  data?: any;
}

export class ThreadManager {
  private dynamoClient: DynamoDBDocumentClient;
  private openai: OpenAI;
  private tableName: string;
  private assistantId: string;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    if (!process.env.OPENAI_ASSISTANT_ID) {
      throw new Error('OPENAI_ASSISTANT_ID environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Use the same DynamoDB client as the rest of the app
    this.dynamoClient = getClient;
    // Use the same TABLE_NAME pattern as existing services
    this.tableName = process.env.TABLE_NAME || "TaskVision";
    this.assistantId = process.env.OPENAI_ASSISTANT_ID;
  }

  /**
   * Get or create a conversation thread for a user
   */
  async getOrCreateThread(userId: string, title?: string): Promise<ConversationThread> {
    try {
      // First, try to get the active thread for this user
      const activeThread = await this.getActiveThread(userId);
      
      if (activeThread) {
        return activeThread;
      }

      // Create new OpenAI thread
      const openaiThread = await this.openai.beta.threads.create();
      
      // Create conversation thread record
      const threadId = ulid();
      const now = new Date().toISOString();
      
      const thread: ConversationThread = {
        PK: `USER#${userId}`,
        SK: `THREAD#${threadId}`,
        EntityType: 'ConversationThread',
        threadId,
        openaiThreadId: openaiThread.id,
        title: title || 'New Conversation',
        lastActivity: now,
        messageCount: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now
      };

      await this.dynamoClient.send(new PutCommand({
        TableName: this.tableName,
        Item: thread
      }));

      return thread;
    } catch (error) {
      console.error('Error getting/creating thread:', error);
      throw error;
    }
  }

  /**
   * Get the active thread for a user
   */
  async getActiveThread(userId: string): Promise<ConversationThread | null> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        FilterExpression: 'isActive = :active',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'THREAD#',
          ':active': true
        },
        ScanIndexForward: false, // Get most recent first
        Limit: 1
      }));

      return result.Items?.[0] as ConversationThread || null;
    } catch (error) {
      console.error('Error getting active thread:', error);
      return null;
    }
  }

  /**
   * Get all conversation threads for a user
   */
  async getThreadsForUser(userId: string, limit: number = 50): Promise<ConversationThread[]> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `USER#${userId}`,
          ':sk': 'THREAD#'
        },
        ScanIndexForward: false, // Most recent first
        Limit: limit
      }));

      return (result.Items || []) as ConversationThread[];
    } catch (error) {
      console.error('Error getting threads for user:', error);
      return [];
    }
  }

  /**
   * Send a message to a thread using ChatGPT Assistants API
   */
  async sendMessage(
    userId: string, 
    message: string, 
    threadId?: string
  ): Promise<{
    thread: ConversationThread;
    response: string;
    functionCalled?: string;
    data?: any;
  }> {
    try {
      let thread: ConversationThread;
      
      if (threadId) {
        const existingThread = await this.getThreadById(userId, threadId);
        if (!existingThread) {
          throw new Error('Thread not found');
        }
        thread = existingThread;
      } else {
        // Generate title from first message
        const title = await this.generateThreadTitle(message);
        thread = await this.getOrCreateThread(userId, title);
      }

      // Check for daily wellness coaching (only for new conversations)
      let wellnessMessage = '';
      if (!threadId) {
        wellnessMessage = await this.checkDailyWellnessCoaching(userId);
      }

      // Combine wellness message with user message if needed
      const finalMessage = wellnessMessage ? `${wellnessMessage}\n\nUser message: ${message}` : message;

      // Add user message to OpenAI thread
      await this.openai.beta.threads.messages.create(thread.openaiThreadId, {
        role: 'user',
        content: finalMessage
      });

      // Create and run the assistant
      const run = await this.openai.beta.threads.runs.create(thread.openaiThreadId, {
        assistant_id: this.assistantId
      });

      // Wait for completion and handle tool calls
      const completedRun = await this.waitForRunCompletion(thread.openaiThreadId, run.id, 30, userId);
      
      // Get the assistant's response
      const messages = await this.openai.beta.threads.messages.list(thread.openaiThreadId, {
        order: 'desc',
        limit: 1
      });

      const assistantMessage = messages.data[0];
      const responseContent = assistantMessage.content[0];
      
      let responseText = '';
      if (responseContent.type === 'text') {
        responseText = this.cleanMarkdownFormatting(responseContent.text.value);
      }

      // Save both messages to our database
      await this.saveMessage(thread.threadId, 'user', message);
      await this.saveMessage(
        thread.threadId, 
        'assistant', 
        responseText,
        completedRun.functionCalled,
        completedRun.data
      );

      // Update thread activity
      await this.updateThreadActivity(thread, message, responseText);

      return {
        thread,
        response: responseText,
        functionCalled: completedRun.functionCalled,
        data: completedRun.data
      };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Check for daily wellness coaching and return coaching message if needed
   */
  private async checkDailyWellnessCoaching(userId: string): Promise<string> {
    try {
      const { hasCheckedWellnessToday, markWellnessCheckedToday, getWellnessStatusForCoaching, getRecentWellnessTasks } = await import('../wellness/wellness-operations');
      
      // Check if we've already done wellness coaching today
      const hasChecked = await hasCheckedWellnessToday(userId);
      if (hasChecked) {
        return ''; // No wellness message needed
      }

      // Mark as checked for today
      await markWellnessCheckedToday(userId);

      // Get wellness status
             const wellnessStatus = await getWellnessStatusForCoaching(userId, "America/New_York");
      
      if (wellnessStatus.score >= 80) {
        // User is doing well - offer praise
        return `WELLNESS CHECK: Nice work — your wellness score is ${wellnessStatus.score} this week. You're keeping your habits alive 👏`;
      } else if (wellnessStatus.lowPractice) {
        // User is behind - offer coaching
        const recentTasks = await getRecentWellnessTasks(userId, wellnessStatus.lowPractice, 3);
        const practiceData = wellnessStatus.practices[wellnessStatus.lowPractice];
        
        let coachingMessage = `WELLNESS CHECK: Looks like you're behind on ${wellnessStatus.lowPractice} this week (${practiceData.completed}/${practiceData.target} completed).`;
        
        if (recentTasks.length > 0) {
          coachingMessage += ` You've previously done: ${recentTasks.join(', ')}.`;
        }
        
        coachingMessage += ` Want to repeat one or try something new?`;
        
        return coachingMessage;
      }
      
      return ''; // No specific coaching needed
    } catch (error) {
      console.error('Error checking daily wellness coaching:', error);
      return ''; // Fail silently to not disrupt normal conversation
    }
  }

  /**
   * Wait for OpenAI run to complete
   */
  private async waitForRunCompletion(threadId: string, runId: string, maxAttempts: number = 30, userId?: string): Promise<any> {
    for (let i = 0; i < maxAttempts; i++) {
      const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
      
      if (run.status === 'completed') {
        return run;
      }
      
      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'Unknown error'}`);
      }

      if (run.status === 'requires_action') {
        // Handle tool calls
        const toolCalls = run.required_action?.submit_tool_outputs?.tool_calls || [];
        const toolOutputs = [];

        for (const toolCall of toolCalls) {
          const result = await this.executeToolCall(toolCall.function.name, JSON.parse(toolCall.function.arguments), userId || '');
          toolOutputs.push({
            tool_call_id: toolCall.id,
            output: JSON.stringify(result)
          });
        }

        // Submit tool outputs
        await this.openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
          tool_outputs: toolOutputs
        });
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    throw new Error('Run timed out');
  }

     /**
    * Execute tool calls
    */
   private async executeToolCall(functionName: string, args: any, userId: string): Promise<any> {
     // Import task operations
     const { createTask, updateTask, deleteTask, getTasksForUser } = await import('../db/task-operations');
     
     // Helper function to map OpenAI Assistant parameters to TaskVision format
     const mapTaskData = (args: any) => {
       const mapped: any = {
         title: args.title,
         description: args.description,
         dueDate: args.due_date,
         tags: args.tags,
         priority: args.priority,
         isMIT: args.is_mit !== undefined ? args.is_mit : args.isMIT,
         status: args.status === 'active' ? 'Open' : 
                args.status === 'completed' ? 'Completed' : 
                args.status === 'cancelled' ? 'Canceled' : 
                args.status || 'Open'
       };
       
       // Remove undefined values
       Object.keys(mapped).forEach(key => {
         if (mapped[key] === undefined) {
           delete mapped[key];
         }
       });
       
       return mapped;
     };

     const mapFilters = (args: any) => {
       const filters: any = {};
       
       if (args.status) {
         const statusMap: any = {
           'active': 'Open',
           'completed': 'Completed', 
           'cancelled': 'Canceled'
         };
         filters.status = [statusMap[args.status] || args.status];
       }
       
       if (args.tags) {
         filters.tags = args.tags;
       }
       
       if (args.due_date_range) {
         filters.startDate = args.due_date_range.start;
         filters.endDate = args.due_date_range.end;
         if (filters.startDate && filters.endDate) {
           filters.dateFilter = 'dueThisWeek'; // Generic range filter
         }
       }
       
       return filters;
     };

     switch (functionName) {
       case 'create_task':
         const taskData = mapTaskData(args);
         taskData.status = taskData.status || 'Open'; // Default status
         return await createTask(userId, taskData);
         
       case 'create_multiple_tasks':
         const tasks = args.tasks || [];
         const results = [];
         const successes = [];
         const failures = [];

         for (const taskInput of tasks) {
           try {
             const mappedTaskData = mapTaskData(taskInput);
             mappedTaskData.status = mappedTaskData.status || 'Open';
             const task = await createTask(userId, mappedTaskData);
             successes.push(task);
             results.push({ success: true, task, originalTitle: taskInput.title });
           } catch (error) {
             failures.push({ title: taskInput.title, error: error instanceof Error ? error.message : 'Unknown error' });
             results.push({ success: false, error: error instanceof Error ? error.message : 'Unknown error', originalTitle: taskInput.title });
           }
         }

         return {
           results,
           summary: {
             total: tasks.length,
             successful: successes.length,
             failed: failures.length,
             successfulTasks: successes,
             failedTasks: failures
           }
         };
         
       case 'update_task':
         const updateData = mapTaskData(args);
         return await updateTask(userId, args.task_id, updateData);
         
       case 'complete_task':
         return await updateTask(userId, args.task_id, { status: 'Completed' });
         
       case 'cancel_task':
         return await updateTask(userId, args.task_id, { status: 'Canceled' });
         
       case 'list_tasks':
         const filters = mapFilters(args);
         return await getTasksForUser(userId, filters);
         
       case 'get_due_today':
         const todayStr = new Date().toISOString().split('T')[0];
         return await getTasksForUser(userId, { dateFilter: 'dueToday', startDate: todayStr });
         
       case 'get_due_this_week':
         const weekFromNow = new Date();
         weekFromNow.setDate(weekFromNow.getDate() + 7);
         const weekStart = new Date().toISOString().split('T')[0];
         const weekEnd = weekFromNow.toISOString().split('T')[0];
         return await getTasksForUser(userId, { dateFilter: 'dueThisWeek', startDate: weekStart, endDate: weekEnd });
         
       case 'get_task_by_id':
         const { getTask } = await import('../db/task-operations');
         return await getTask(userId, args.task_id);
         
       case 'reschedule_task':
         return await updateTask(userId, args.task_id, { dueDate: args.new_due_date });

       // Enhanced Date and Wellness functions
       case 'get_current_date':
         const currentDate = new Date();
         const { getWeekStart } = await import('../wellness/wellness-operations');
         return {
           currentDate: currentDate.toISOString().split('T')[0],
           currentWeekStart: getWeekStart(currentDate),
           dayOfWeek: currentDate.toLocaleDateString('en-US', { weekday: 'long' }),
           weekday: currentDate.getDay(), // 0 = Sunday, 1 = Monday, etc.
           timestamp: currentDate.toISOString()
         };
         
       case 'get_week_start':
         const { getWeekStart: getWeekStartFn } = await import('../wellness/wellness-operations');
         const inputDate = args.date ? new Date(args.date) : new Date();
         return {
           weekStart: getWeekStartFn(inputDate),
           inputDate: args.date || inputDate.toISOString().split('T')[0]
         };
         
       case 'get_wellness_status_detailed':
         const { getWellnessStatusForCoaching, getPracticeInstances, getWeeklyScores, getWeekStart: getWeekStartUtil } = await import('../wellness/wellness-operations');
         
         // Determine the week to check
         const targetWeekStart = args.weekStart || getWeekStartUtil(new Date(), "America/New_York");
         const targetWeekEnd = new Date(targetWeekStart);
         targetWeekEnd.setDate(targetWeekEnd.getDate() + 6);
         const weekEndStr = targetWeekEnd.toISOString().split('T')[0];
         
         // Get practices for the week
         const weekPractices = await getPracticeInstances(userId, targetWeekStart, weekEndStr);
         
         // Get weekly score
         const weeklyScores = await getWeeklyScores(userId, 1, "America/New_York");
         const currentWeekScore = weeklyScores.find(s => s.weekStart === targetWeekStart);
         
         // Calculate detailed status
         const practiceStatus: Record<string, { completed: number; target: number; completionRate: number }> = {
           'Gratitude': { completed: 0, target: 7, completionRate: 0 },
           'Meditation': { completed: 0, target: 7, completionRate: 0 },
           'Kindness': { completed: 0, target: 2, completionRate: 0 },
           'Social Outreach': { completed: 0, target: 2, completionRate: 0 },
           'Novelty Challenge': { completed: 0, target: 2, completionRate: 0 },
           'Savoring Reflection': { completed: 0, target: 7, completionRate: 0 },
           'Exercise': { completed: 0, target: 7, completionRate: 0 },
         };
         
         weekPractices.forEach(practice => {
           if (practice.completed && practiceStatus[practice.practice]) {
             practiceStatus[practice.practice].completed++;
           }
         });
         
         // Calculate completion rates
         Object.keys(practiceStatus).forEach(practice => {
           const status = practiceStatus[practice];
           status.completionRate = Math.round((status.completed / status.target) * 100);
         });
         
         // Find lowest performing practice
         const lowestPractice = Object.entries(practiceStatus)
           .sort(([,a], [,b]) => a.completionRate - b.completionRate)[0];
         
         return {
           weekStart: targetWeekStart,
           weekEnd: weekEndStr,
           overallScore: currentWeekScore?.score || 0,
           practiceStatus,
           lowestPractice: {
             name: lowestPractice[0],
             ...lowestPractice[1]
           },
           totalPractices: weekPractices.length,
           completedPractices: weekPractices.filter(p => p.completed).length,
           weekSummary: `Week of ${targetWeekStart}: ${currentWeekScore?.score || 0}% overall wellness score`
         };
         
       case 'get_wellness_history':
         const { getWeeklyScores: getScores } = await import('../wellness/wellness-operations');
         const historyWeeks = args.weeks || 4;
         const historicalScores = await getScores(userId, historyWeeks, "America/New_York");
         
         return {
           weeks: historyWeeks,
           scores: historicalScores.map(score => ({
             weekStart: score.weekStart,
             score: score.score,
             weekLabel: `Week of ${score.weekStart}`
           })),
           averageScore: historicalScores.length > 0 
             ? Math.round(historicalScores.reduce((sum, s) => sum + s.score, 0) / historicalScores.length)
             : 0,
           trend: historicalScores.length >= 2
             ? historicalScores[0].score - historicalScores[historicalScores.length - 1].score
             : 0
         };

       // Legacy wellness functions (maintained for compatibility)
       case 'get_wellness_status':
         const { getWellnessStatusForCoaching: getStatus } = await import('../wellness/wellness-operations');
         return await getStatus(userId, "America/New_York");
         
       case 'list_recent_wellness_tasks':
         const { getRecentWellnessTasks } = await import('../wellness/wellness-operations');
         return await getRecentWellnessTasks(userId, args.practice, args.limit || 3);
         
       case 'create_wellness_task_suggestion':
         // Create a wellness-related task
         const wellnessTaskData = {
           title: args.title || `${args.practice} practice`,
           description: args.description || `Complete ${args.practice} practice`,
           dueDate: args.date || new Date().toISOString().split('T')[0],
           tags: ['Wellness'],
           priority: 2,
           isMIT: false,
           status: 'Open' as const
         };
         return await createTask(userId, wellnessTaskData);

       // Existing functions continue...
       case 'suggest_tags':
         // RESERVED TAG PRIORITY: Suggest reserved tags first, then custom
         const description = args.description?.toLowerCase() || '';
         const suggestedTags = [];
         
         // Check RESERVED TAGS first
         if (description.includes('work') || description.includes('office') || description.includes('professional')) suggestedTags.push('Work');
         if (description.includes('personal') || description.includes('home') || description.includes('family')) suggestedTags.push('Personal');
         if (description.includes('team') || description.includes('group') || description.includes('collaboration')) suggestedTags.push('Team');
         if (description.includes('learn') || description.includes('training') || description.includes('course')) suggestedTags.push('Training');
         if (description.includes('research') || description.includes('investigate') || description.includes('study')) suggestedTags.push('Research');
         if (description.includes('creative') || description.includes('design') || description.includes('art')) suggestedTags.push('Creative');
         if (description.includes('customer') || description.includes('client') || description.includes('presentation')) suggestedTags.push('Customer');
         if (description.includes('follow') || description.includes('callback') || description.includes('response')) suggestedTags.push('Follow-up');
         if (description.includes('thank') || description.includes('gratitude') || description.includes('appreciate')) suggestedTags.push('Gratitude');
         if (description.includes('boss') || description.includes('leader') || description.includes('management')) suggestedTags.push('Leader');
         if (description.includes('quick') || description.includes('5 min') || description.includes('fast')) suggestedTags.push('5-min');
         
         // Add custom tags only if they provide additional context
         if (description.includes('urgent') || description.includes('asap')) suggestedTags.push('urgent');
         if (description.includes('meeting') || description.includes('call')) suggestedTags.push('meeting');
         if (description.includes('health') || description.includes('doctor')) suggestedTags.push('health');
         if (description.includes('wellness') || description.includes('mindfulness') || description.includes('meditation')) suggestedTags.push('Wellness');
         
         return { suggested_tags: suggestedTags };
         
       case 'prioritize_tasks':
         // Get tasks by IDs and return them sorted by priority
         const priorityTasks = [];
         for (const taskId of args.task_ids || []) {
           const { getTask } = await import('../db/task-operations');
           const task = await getTask(userId, taskId);
           if (task) priorityTasks.push(task);
         }
         priorityTasks.sort((a, b) => (b.priority || 1) - (a.priority || 1));
         return { prioritized_tasks: priorityTasks };
         
       case 'make_task_mit':
         return await updateTask(userId, args.task_id, { 
           isMIT: true, 
           priority: args.priority || 1 
         });
         
       case 'remove_mit_status':
         return await updateTask(userId, args.task_id, { isMIT: false });
         
       case 'get_mit_tasks':
         const mitTasksResult = await getTasksForUser(userId, { status: ['Open', 'Waiting'] });
         const mitTasks = mitTasksResult || [];
         return mitTasks.filter(task => task.isMIT).sort((a, b) => a.priority - b.priority);
         
       case 'summarize_tasks':
         const allTasks = await getTasksForUser(userId, {});
         const summary = {
           total_tasks: allTasks?.length || 0,
           open_tasks: allTasks?.filter((t: any) => t.status === 'Open').length || 0,
           completed_tasks: allTasks?.filter((t: any) => t.status === 'Completed').length || 0,
           canceled_tasks: allTasks?.filter((t: any) => t.status === 'Canceled').length || 0,
           high_priority_tasks: allTasks?.filter((t: any) => (t.priority || 1) >= 4).length || 0
         };
         return summary;
         
       case 'list_conversations':
         // Return conversation threads for this user
         return await this.getThreadsForUser(userId, 20);
         
       // Legacy function names for backward compatibility
       case 'createTask':
         return await createTask(userId, args);
       case 'updateTask':
         return await updateTask(userId, args.taskId, args);
       case 'deleteTask':
         return await deleteTask(userId, args.taskId);
       case 'getTasks':
         return await getTasksForUser(userId, args);
         
       default:
         return { error: `Unknown function: ${functionName}` };
     }
   }

  /**
   * Clean markdown formatting from AI responses
   */
  private cleanMarkdownFormatting(text: string): string {
    return text
      // Remove bold formatting
      .replace(/\*\*(.*?)\*\*/g, '$1')
      // Remove italic formatting
      .replace(/\*(.*?)\*/g, '$1')
      // Clean up numbered lists - add proper line breaks
      .replace(/(\d+\.\s)/g, '\n\n$1')
      // Clean up bullet points - add proper line breaks
      .replace(/([•\-\*]\s)/g, '\n\n$1')
      // Add extra line break before "Here are" patterns
      .replace(/(Here are [^:]*:)/g, '\n\n$1\n')
      // Remove extra spaces and normalize line breaks
      .replace(/\n\s*\n/g, '\n\n')
      // Convert double newlines to preserve paragraph breaks
      .replace(/\n\n/g, '\n\n')
      .trim();
  }

  /**
   * Generate a title for a new thread based on the first message
   */
  private async generateThreadTitle(message: string): Promise<string> {
    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Generate a short, descriptive title (max 50 characters) for a conversation that starts with this message. Be concise and focus on the main topic or intent.'
          },
          {
            role: 'user',
            content: message
          }
        ],
        max_tokens: 20,
        temperature: 0.7
      });

      return completion.choices[0].message.content?.trim() || 'New Conversation';
    } catch (error) {
      console.error('Error generating title:', error);
      return 'New Conversation';
    }
  }

  /**
   * Save a message to DynamoDB
   */
  private async saveMessage(
    threadId: string,
    role: 'user' | 'assistant',
    content: string,
    functionCalled?: string,
    data?: any
  ): Promise<void> {
    const messageId = ulid();
    const now = new Date().toISOString();

    const message: ConversationMessage = {
      PK: `THREAD#${threadId}`,
      SK: `MESSAGE#${messageId}`,
      EntityType: 'ConversationMessage',
      messageId,
      threadId,
      role,
      content,
      timestamp: now,
      functionCalled,
      parameters: data?.parameters,
      data: data?.data
    };

    await this.dynamoClient.send(new PutCommand({
      TableName: this.tableName,
      Item: message
    }));
  }

  /**
   * Update thread activity and metadata
   */
  private async updateThreadActivity(
    thread: ConversationThread,
    userMessage: string,
    assistantResponse: string
  ): Promise<void> {
    const now = new Date().toISOString();
    
    await this.dynamoClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: thread.PK,
        SK: thread.SK
      },
      UpdateExpression: 'SET lastMessage = :lastMessage, lastActivity = :lastActivity, messageCount = messageCount + :inc, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':lastMessage': assistantResponse.substring(0, 100) + (assistantResponse.length > 100 ? '...' : ''),
        ':lastActivity': now,
        ':inc': 2, // User message + assistant response
        ':updatedAt': now
      }
    }));
  }

  /**
   * Get a specific thread by ID
   */
  private async getThreadById(userId: string, threadId: string): Promise<ConversationThread | null> {
    try {
      const result = await this.dynamoClient.send(new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `THREAD#${threadId}`
        }
      }));

      return result.Item as ConversationThread || null;
    } catch (error) {
      console.error('Error getting thread by ID:', error);
      return null;
    }
  }

  /**
   * Get messages for a thread
   */
  async getThreadMessages(threadId: string, limit: number = 50): Promise<ConversationMessage[]> {
    try {
      const result = await this.dynamoClient.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `THREAD#${threadId}`,
          ':sk': 'MESSAGE#'
        },
        ScanIndexForward: true, // Chronological order
        Limit: limit
      }));

      return (result.Items || []) as ConversationMessage[];
    } catch (error) {
      console.error('Error getting thread messages:', error);
      return [];
    }
  }

  /**
   * Create a new thread (explicit creation)
   */
  async createNewThread(userId: string, title?: string): Promise<ConversationThread> {
    // Mark current thread as inactive
    const activeThread = await this.getActiveThread(userId);
    if (activeThread) {
      await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: activeThread.PK,
          SK: activeThread.SK
        },
        UpdateExpression: 'SET isActive = :inactive',
        ExpressionAttributeValues: {
          ':inactive': false
        }
      }));
    }

    // Create new thread
    return await this.getOrCreateThread(userId, title || 'New Conversation');
  }

  /**
   * Switch to an existing thread
   */
  async switchToThread(userId: string, threadId: string): Promise<ConversationThread> {
    // Mark current thread as inactive
    const activeThread = await this.getActiveThread(userId);
    if (activeThread && activeThread.threadId !== threadId) {
      await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: activeThread.PK,
          SK: activeThread.SK
        },
        UpdateExpression: 'SET isActive = :inactive',
        ExpressionAttributeValues: {
          ':inactive': false
        }
      }));
    }

    // Activate the target thread
    const targetThread = await this.getThreadById(userId, threadId);
    if (!targetThread) {
      throw new Error('Thread not found');
    }

    await this.dynamoClient.send(new UpdateCommand({
      TableName: this.tableName,
      Key: {
        PK: targetThread.PK,
        SK: targetThread.SK
      },
      UpdateExpression: 'SET isActive = :active, lastActivity = :activity',
      ExpressionAttributeValues: {
        ':active': true,
        ':activity': new Date().toISOString()
      }
    }));

    return { ...targetThread, isActive: true };
  }

  /**
   * Delete a conversation thread and all its messages
   */
  async deleteThread(userId: string, threadId: string): Promise<void> {
    try {
      // Get the thread to verify ownership and get OpenAI thread ID
      const thread = await this.getThreadById(userId, threadId);
      if (!thread) {
        throw new Error('Thread not found');
      }

      // Delete the OpenAI thread
      try {
        await this.openai.beta.threads.del(thread.openaiThreadId);
      } catch (error) {
        console.warn(`Failed to delete OpenAI thread ${thread.openaiThreadId}:`, error);
        // Continue with DynamoDB cleanup even if OpenAI deletion fails
      }

      // Get all messages for this thread
      const messages = await this.getThreadMessages(threadId);
      
      // Delete all messages in batches
      if (messages.length > 0) {
        const deletePromises = messages.map(message => 
          this.dynamoClient.send(new DeleteCommand({
            TableName: this.tableName,
            Key: {
              PK: message.PK,
              SK: message.SK,
            },
          }))
        );
        
        await Promise.all(deletePromises);
      }

      // Delete the thread itself
      await this.dynamoClient.send(new DeleteCommand({
        TableName: this.tableName,
        Key: {
          PK: `USER#${userId}`,
          SK: `THREAD#${threadId}`,
        },
      }));

      // If this was the active thread, we need to activate another thread or create a new one
      if (thread.isActive) {
        const remainingThreads = await this.getThreadsForUser(userId, 1);
        if (remainingThreads.length > 0) {
          // Activate the most recent remaining thread
          await this.switchToThread(userId, remainingThreads[0].threadId);
        }
        // If no threads remain, the next message will create a new thread automatically
      }

    } catch (error) {
      console.error('Error deleting thread:', error);
      throw error;
    }
  }

  /**
   * Update thread title
   */
  async updateThreadTitle(userId: string, threadId: string, title: string): Promise<ConversationThread> {
    try {
      const thread = await this.getThreadById(userId, threadId);
      if (!thread) {
        throw new Error('Thread not found');
      }

      const now = new Date().toISOString();
      
      await this.dynamoClient.send(new UpdateCommand({
        TableName: this.tableName,
        Key: {
          PK: thread.PK,
          SK: thread.SK
        },
        UpdateExpression: 'SET title = :title, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':title': title,
          ':updatedAt': now
        }
      }));

      return { ...thread, title, updatedAt: now };
    } catch (error) {
      console.error('Error updating thread title:', error);
      throw error;
    }
  }
} 