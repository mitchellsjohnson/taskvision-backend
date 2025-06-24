import { ThreadManager, ConversationThread, ConversationMessage } from './thread-manager';
import { logAuditEvent } from '../db/audit-operations';

export interface TVAgentV2Result {
  success: boolean;
  message: string;
  data?: any;
  functionCalled?: string;
  parameters?: any;
  thread?: ConversationThread;
}

export class TVAgentV2Service {
  private threadManager: ThreadManager;

  constructor() {
    this.threadManager = new ThreadManager();
  }

  /**
   * Send a message using the ChatGPT Assistants API
   */
  async sendMessage(
    userId: string, 
    message: string, 
    threadId?: string
  ): Promise<TVAgentV2Result> {
    try {
      const result = await this.threadManager.sendMessage(userId, message, threadId);

      // Log the interaction
      await logAuditEvent(userId, {
        userInput: message,
        functionCalled: result.functionCalled,
        parameters: result.data,
        result: { threadId: result.thread.threadId },
        timestamp: new Date().toISOString()
      });

      return {
        success: true,
        message: result.response,
        data: result.data,
        functionCalled: result.functionCalled,
        thread: result.thread
      };
    } catch (error) {
      console.error('TVAgent V2 processing error:', error);

      // Log the error
      await logAuditEvent(userId, {
        userInput: message,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });

      throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get conversation threads for a user
   */
  async getConversationThreads(userId: string, limit?: number): Promise<ConversationThread[]> {
    try {
      return await this.threadManager.getThreadsForUser(userId, limit);
    } catch (error) {
      console.error('Error getting conversation threads:', error);
      return [];
    }
  }

  /**
   * Get messages for a specific thread
   */
  async getThreadMessages(threadId: string, limit?: number): Promise<ConversationMessage[]> {
    try {
      return await this.threadManager.getThreadMessages(threadId, limit);
    } catch (error) {
      console.error('Error getting thread messages:', error);
      return [];
    }
  }

  /**
   * Create a new conversation thread
   */
  async createNewThread(userId: string, title?: string): Promise<ConversationThread> {
    try {
      return await this.threadManager.createNewThread(userId, title);
    } catch (error) {
      console.error('Error creating new thread:', error);
      throw error;
    }
  }

  /**
   * Switch to an existing thread
   */
  async switchToThread(userId: string, threadId: string): Promise<ConversationThread> {
    try {
      return await this.threadManager.switchToThread(userId, threadId);
    } catch (error) {
      console.error('Error switching to thread:', error);
      throw error;
    }
  }

  /**
   * Get the active thread for a user
   */
  async getActiveThread(userId: string): Promise<ConversationThread | null> {
    try {
      return await this.threadManager.getActiveThread(userId);
    } catch (error) {
      console.error('Error getting active thread:', error);
      return null;
    }
  }

  /**
   * Delete a conversation thread and all its messages
   */
  async deleteThread(userId: string, threadId: string): Promise<void> {
    try {
      await this.threadManager.deleteThread(userId, threadId);
      
      // Log the deletion
      await logAuditEvent(userId, {
        userInput: `delete_thread:${threadId}`,
        functionCalled: 'delete_thread',
        result: { threadId: threadId },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error deleting thread:', error);
      
      // Log the error
      await logAuditEvent(userId, {
        userInput: `delete_thread:${threadId}`,
        functionCalled: 'delete_thread',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Update thread title
   */
  async updateThreadTitle(userId: string, threadId: string, title: string): Promise<ConversationThread> {
    try {
      return await this.threadManager.updateThreadTitle(userId, threadId, title);
    } catch (error) {
      console.error('Error updating thread title:', error);
      throw error;
    }
  }
} 