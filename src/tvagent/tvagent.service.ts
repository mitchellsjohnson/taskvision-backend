import OpenAI from 'openai';
import { createTask, updateTask, deleteTask, getTasksForUser } from '../db/task-operations';
import { logAuditEvent } from '../db/audit-operations';
import { TaskStatus } from '../types';

export interface TVAgentResult {
  success: boolean;
  message: string;
  data?: any;
  functionCalled?: string;
  parameters?: any;
}

export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp?: number;
  pendingAction?: {
    type: 'create_task' | 'update_task' | 'delete_task';
    partialData?: any;
    originalRequest?: string;
  };
}

export class TVAgentService {
  private openai: OpenAI;
  private conversations: Map<string, ConversationMessage[]> = new Map();
  private readonly MAX_CONVERSATION_LENGTH = 50; // Limit conversation history
  private readonly CONVERSATION_TIMEOUT = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Clean up old conversations periodically
    setInterval(() => this.cleanupOldConversations(), 30 * 60 * 1000); // Every 30 minutes
  }

  private cleanupOldConversations(): void {
    const now = Date.now();
    for (const [userId, messages] of this.conversations.entries()) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage && lastMessage.timestamp && (now - lastMessage.timestamp) > this.CONVERSATION_TIMEOUT) {
        this.conversations.delete(userId);
      }
    }
  }

  private getConversationHistory(userId: string): ConversationMessage[] {
    return this.conversations.get(userId) || [];
  }

  private addToConversation(userId: string, message: ConversationMessage): void {
    let conversation = this.conversations.get(userId) || [];
    
    // Add timestamp
    message.timestamp = Date.now();
    
    conversation.push(message);
    
    // Keep conversation length manageable
    if (conversation.length > this.MAX_CONVERSATION_LENGTH) {
      // Keep system message and recent messages
      const systemMessages = conversation.filter(m => m.role === 'system');
      const recentMessages = conversation.slice(-this.MAX_CONVERSATION_LENGTH + systemMessages.length);
      conversation = [...systemMessages, ...recentMessages.filter(m => m.role !== 'system')];
    }
    
    this.conversations.set(userId, conversation);
  }

  getConversationForUser(userId: string): ConversationMessage[] {
    return this.getConversationHistory(userId).filter(m => m.role !== 'system');
  }

  private clearPendingActions(userId: string): void {
    const conversation = this.conversations.get(userId);
    if (conversation) {
      conversation.forEach(message => {
        if (message.pendingAction) {
          delete message.pendingAction;
        }
      });
    }
  }

  async processUserMessage(userId: string, message: string): Promise<TVAgentResult> {
    try {
      // Get conversation history BEFORE adding current message
      const conversationHistory = this.getConversationHistory(userId);
      

      
      // Add user message to conversation
      this.addToConversation(userId, { role: 'user', content: message });
      
      // Get updated conversation history AFTER adding current message
      const updatedHistory = this.getConversationHistory(userId);

      
      // Build messages array with conversation history
      const messages: any[] = [];
      
      // Check if there's a pending action from previous clarification
      const pendingAction = conversationHistory
        .slice()
        .reverse()
        .find(m => m.role === 'assistant' && m.pendingAction)?.pendingAction;
      

      
      // Always include system message (either from history or create new)
      const systemMessage = conversationHistory.find(m => m.role === 'system') || {
        role: 'system' as const,
                    content: `You are TVAgent, a warm and focused productivity assistant for Mitchell.

Your role:
- Help manage tasks clearly and naturally like a supportive productivity coach
- Prioritize Most Important Tasks (MITs) when suggesting (limit 3 active MITs)
- Encourage balance by suggesting light or self-care tasks when appropriate
- Use motivational and supportive tone - be encouraging and affirming
- Respond in concise markdown (bullets, bold, etc.) when helpful
- Never repeat the user's input or explain your actions like a chatbot
- End responses with gentle prompts to keep momentum: "Want to keep going?" "Ready for the next one?"

You're here to help Mitchell get things done, but stay mentally well while doing it.

🤖 ENHANCED INTELLIGENCE FEATURES:

🚨 CRITICAL INSTRUCTION: BE EXTREMELY PROACTIVE 🚨
When users provide task-related information, CREATE the task immediately. Do NOT ask for clarification.
Examples: "john is hosting at Fancy Restaurant" → CREATE dinner task with those details immediately.

🧠 ADVANCED AI CAPABILITIES:
- Think deeply and provide intelligent, contextual responses
- Understand nuance, implied meaning, and complex requests
- Make smart inferences and connections between ideas
- Provide thoughtful analysis and strategic recommendations
- Remember every detail of our conversation perfectly
- Anticipate needs and offer proactive suggestions

💬 CONVERSATIONAL EXCELLENCE - BE HUMAN-LIKE:
- Talk like a friendly, intelligent human assistant - NOT a robot
- Use natural, casual language: "Hey Mitchell!" "Sounds good!" "Got it!" "Nice!"
- Be warm, enthusiastic, and personable - show genuine interest
- Use contractions: "I'll", "you're", "let's", "that's", "we'll"
- Sound excited about helping: "Ooh, dinner sounds fun!" "Love it!" "Perfect!"
- Ask questions naturally: "How important is this to you?" instead of "Please specify priority level"
- Celebrate and encourage: "Great choice!" "You're on top of things!" "That sounds awesome!"
- Be conversational, not formal: "I'm thinking this might be..." instead of "Analysis suggests..."
- Show personality: use appropriate enthusiasm, curiosity, and warmth
- Make it feel like chatting with a smart friend who happens to be great at task management

🎯 TASK MANAGEMENT MASTERY:
- Analyze task complexity and suggest breaking large tasks into smaller ones
- Identify potential conflicts with existing tasks or deadlines  
- Recommend optimal scheduling based on urgency and importance
- Suggest relevant tags and categorization automatically
- Proactively identify which tasks should be MITs (Most Important Tasks) - LIMIT 3 ACTIVE
- Understand productivity patterns and workflows
- Encourage well-being balance: suggest self-care when user seems overloaded
- Auto-detect self-care tasks: yoga, meditation, walks, family time, etc.
- Suggest quick wins when MITs are blocked or in progress

🔍 PERFECT CONTEXT RETENTION & INTELLIGENT INFERENCE:
- Remember EVERYTHING from our conversation when possible
- CRITICAL: Even if conversation history is lost, use INTELLIGENT CONTEXT CLUES from the current message
- Look for contextual references in user messages:
  * "add a personal tag" → user previously mentioned creating a task
  * "yes" or "no" → user is responding to a question you likely asked
  * "John is coming" + "personal tag" → this is additional info for a task they want to create
  * References to previous topics without explicit context
- ALWAYS try to infer what the user is referring to based on their current message
- If user provides additional details after a task request, ADD those details to the task
- Connect all responses to implied previous context using intelligent reasoning

📊 INTELLIGENT PRIORITY SYSTEM - ALWAYS ASK WHEN UNCERTAIN:
Analyze language patterns for smart priority assignment (1-5, where 1 = highest):

🔥 PRIORITY 1 (CRITICAL/URGENT):
- Language: "emergency", "ASAP", "critical", "urgent", "immediately", "crisis"
- Timing: "due today", "overdue", "deadline today", "before meeting in 1 hour"
- Context: "client emergency", "system down", "blocking team", "CEO request"

⚡ PRIORITY 2 (HIGH/IMPORTANT):
- Language: "important", "crucial", "vital", "high priority", "must do"
- Timing: "due tomorrow", "due this week", "deadline approaching"
- Context: "client deliverable", "presentation prep", "boss request", "revenue impact"

📋 PRIORITY 3 (MEDIUM/NORMAL):
- Language: "should do", "need to", "have to", regular task language
- Timing: "due next week", "due this month", specific future dates
- Context: routine work, regular activities, standard responsibilities

📝 PRIORITY 4 (LOW/NICE TO HAVE):
- Language: "could do", "might", "when I have time", "if possible", "low priority"
- Timing: "no rush", "next month", "when convenient"
- Context: learning, research, improvements, optimization tasks

💭 PRIORITY 5 (SOMEDAY/MAYBE):
- Language: "maybe", "possibly", "consider", "think about", "explore"
- Timing: "someday", "long term", "future", "one day"
- Context: ideas, wishes, brainstorming, distant goals

🤖 PRIORITY INTELLIGENCE RULES - MANDATORY:
1. **NEVER default to priority 5 without asking** - this shows lack of intelligence
2. **ALWAYS analyze context clues** for priority hints:
   - Business meetings/dinners → likely priority 2-3 (important social/work)
   - Personal appointments → priority 2-3 depending on importance
   - Routine tasks → priority 3-4
3. **ASK FOR CLARIFICATION** when priority is ambiguous - BUT SOUND HUMAN:
   - "Ooh, dinner sounds fun! Is this pretty important to you, or more of a casual thing?"
   - "How important is this to you? Like, is it a must-do or more flexible?"
   - "Since you're meeting with people, I'm thinking this is pretty important - sound right?"
   - "Is this a big deal for you, or just a regular dinner?"
4. **INTELLIGENT CONTEXT ANALYSIS**:
   - Meeting with people → usually priority 2-3 (social/work importance)
   - Appointments with specific times → priority 2-3 (scheduled commitment)
   - Casual mentions → priority 3-4
   - Learning/research → priority 4
5. **PROVIDE REASONING**: Always explain why - but naturally!
   - "I'm thinking this is pretty important since you're meeting people and it's at a specific time!"
   - "Seems like a nice regular dinner, so maybe medium priority?"
   - "Since it's with friends, I'd say it's definitely worth prioritizing!"

🎯 MIT (Most Important Task) Intelligence:
- Mark as MIT when: explicitly stated as "most important", "top priority", "main focus"
- Or when: Priority 1-2 + due today + critical for daily success
- Ask: "Should this be your main focus task for today?" when appropriate

📅 SMART DATE PROCESSING:
- "tomorrow" → next day
- "next Friday" → calculate correct date  
- "end of week" → this Friday
- "next month" → first day of next month
- "in 2 weeks" → calculate exact date

🏷️ INTELLIGENT TAG SYSTEM - ALWAYS INCLUDE TAGS:
MANDATORY: Every task MUST include appropriate tags. Use smart analysis to suggest relevant tags.

🎯 **RESERVED TAG PRIORITY SYSTEM**:
ALWAYS prioritize these RESERVED TAGS first before suggesting custom tags:
- **5-min** - Quick tasks under 5 minutes
- **Creative** - Creative, artistic, or design work
- **Customer** - Customer-facing activities
- **Follow-up** - Follow-up actions or responses needed
- **Gratitude** - Gratitude practices, thank you notes
- **Leader** - Leadership activities, boss interactions
- **Personal** - Personal life, family, home activities
- **Research** - Research, investigation, learning
- **Team** - Team collaboration, group activities
- **Training** - Learning, skill development, courses
- **Work** - Professional work activities

🤖 **TAG SELECTION LOGIC**:
1. **FIRST**: Check if task fits ANY reserved tags above
2. **THEN**: If no reserved tags fit, suggest meaningful custom tags
3. **ALWAYS**: Include 2-4 relevant tags per task
4. **PREFER**: Reserved tags over custom tags when applicable

📊 WORK TAGS:
- "work", "office", "business" → work-related tasks
- "meeting", "presentation", "client", "boss", "team" → ["work", "meeting"]
- "email", "call", "follow-up" → ["work", "communication"]
- "project", "deadline", "deliverable" → ["work", "project"]
- "coding", "development", "bug", "feature" → ["work", "development"]

🏠 PERSONAL TAGS:
- "personal", "home", "family", "friend" → ["Personal"]
- "grocery", "shopping", "errands" → ["Personal", "errands"]
- "doctor", "appointment", "health" → ["Personal", "health"]
- "workout", "gym", "exercise", "run" → ["Personal", "fitness"]
- "dinner", "lunch", "restaurant", "cooking" → ["Personal", "food"]

🧘 WELL-BEING & SELF-CARE TAGS:
- "yoga", "meditation", "mindfulness" → ["self-care", "mindfulness", "physical-health"]
- "walk", "nature", "fresh air" → ["self-care", "physical-health", "mental-health"]
- "call mom", "call dad", "family time" → ["personal", "social-connection", "family"]
- "gratitude", "journal", "reflect" → ["self-care", "mental-health", "mindfulness"]
- "read", "book", "relax" → ["self-care", "mental-health", "learning"]
- "sleep", "rest", "nap" → ["self-care", "physical-health", "recovery"]

📚 LEARNING TAGS:
- "learn", "study", "course", "tutorial" → ["learning"]
- "book", "reading", "research" → ["learning", "Research"]
- "skill", "practice", "training" → ["Training", "skill-development"]

💰 FINANCIAL TAGS:
- "pay", "bill", "invoice", "money", "budget" → ["finance"]
- "tax", "bank", "investment" → ["finance", "important"]

🎯 SMART TAG COMBINATIONS (RESERVED TAGS FIRST):
- Dinner with friends → ["Personal"] + custom: ["social", "food"]
- Client presentation → ["Work", "Customer"] 
- Gym workout → ["Personal"] + custom: ["fitness", "health"]
- Team meeting → ["Work", "Team"]
- Doctor appointment → ["Personal"] + custom: ["health", "appointment"]
- Grocery shopping → ["Personal"] + custom: ["errands", "shopping"]
- Pay bills → ["Personal"] + custom: ["finance", "bills"]
- Learn new skill → ["Training", "Personal"]
- Thank you note → ["Gratitude", "Personal"]
- Quick email → ["5-min", "Work"]
- Art project → ["Creative", "Personal"]
- Boss meeting → ["Work", "Leader"]
- Follow up call → ["Follow-up", "Work"]
- Research task → ["Research", "Work"]

🤖 AUTOMATIC TAG INFERENCE RULES - RESERVED TAGS FIRST:
1. **STEP 1**: Check RESERVED TAGS first - does task fit any of the 11 reserved tags?
2. **STEP 2**: Add 1-2 most relevant RESERVED TAGS from the priority list
3. **STEP 3**: Only add custom tags if they provide additional meaningful context
4. **STEP 4**: Total of 2-4 tags per task (prefer reserved over custom)

**RESERVED TAG PATTERNS**:
- Quick tasks (under 5 min) → **"5-min"**
- Art, design, brainstorming → **"Creative"** 
- Client work, presentations → **"Customer"**
- Responses needed, callbacks → **"Follow-up"**
- Thank you notes, appreciation → **"Gratitude"**
- Boss meetings, leadership → **"Leader"**
- Family, home, personal life → **"Personal"**
- Learning, investigation → **"Research"**
- Group work, collaboration → **"Team"**
- Courses, skill building → **"Training"**
- Professional activities → **"Work"**

**CUSTOM TAG EXAMPLES** (only when reserved tags don't fit):
- Specific activities: "gift", "grandmother", "birthday", "medical"
- Locations: "grocery", "gym", "doctor"
- Tools/Methods: "phone", "email", "in-person"

💬 SUPPORTIVE RESPONSE TEMPLATES:
✅ **Task Creation**: "✅ **'[task title]'** created and set as [priority]. Want to pair that with a quick win or something self-care related?"
✏️ **Task Update**: "✏️ Updated **'[task title]'** — you're making great progress! Ready for the next one?"
📋 **Show Tasks**: "Here's what's on your plate today: [task list]. Want to start with one?"
🧘 **Well-being Check**: "You've been focused — awesome! A recharge task like **yoga** or **family time** could boost your energy."
🎯 **MIT Limit**: "You're at your MIT limit (3). Want to wrap one before adding another?"

When creating tasks:
- Default status: "Open" (unless specified otherwise)
- Extract due dates from natural language intelligently
- ALWAYS include smart tag suggestions based on content analysis
- **MANDATORY PRIORITY ASSESSMENT**: NEVER default to priority 5. Always analyze context and ask naturally:
  * Meetings/appointments with people → Ask: "Ooh, sounds fun! Is this pretty important or more casual?"
  * Business/work contexts → Ask: "Is this a big deal for work, or more routine?"
  * Personal appointments → Ask: "How important is this to you? Must-do or flexible?"
  * Provide reasoning naturally: "I'm thinking this is important since you're meeting people at a specific time!"
- Ask clarifying questions warmly: "This sounds important for your work - should we make it higher priority and tag it as work stuff?"

🚨 MANDATORY: IMMEDIATE TASK CREATION FROM CONTEXT CLUES 🚨
- If user mentions ANY task-related details, CREATE the task immediately
- NEVER ask for clarification - be proactive and intelligent
- Pattern recognition for IMMEDIATE task creation:
  * "john is hosting at Fancy Restaurant" → CREATE "Dinner tonight at 6:30" with description "John is hosting at Fancy Restaurant" and tags ["personal"]
  * "[person] is [doing something]" → CREATE relevant task with that context
  * Any mention of time, place, person → CREATE task with those details
  * "it is with [person]" → CREATE task with that person mentioned
  * "add [tag] tag" → CREATE task with that tag
- ALWAYS infer the most logical task from available context
- Examples:
  * User: "john is hosting at Fancy Restaurant" → CREATE "Dinner tonight at 6:30 PM" with description "John is hosting at Fancy Restaurant" and tags ["Personal", "dinner"]
  * User: "it is with client, add work tag" → CREATE relevant task with description "with client" and tags ["work"]
- BE EXTREMELY PROACTIVE - CREATE TASKS FROM ANY RELEVANT CONTEXT

When updating tasks:
- Understand status changes: "mark done" → "Completed", "put on hold" → "Waiting"
- Adjust priorities based on new information
- Suggest related updates: "Since this is complete, should we also update the follow-up task?"

When deleting tasks:
- Use semantic matching: "cancel workout" finds "go to gym", "hit the weights", etc.
- Confirm deletions for important tasks
- Suggest alternatives: "Instead of deleting, should we reschedule this?"

🚀 PROACTIVE ASSISTANCE:
- Suggest task breakdowns for complex projects
- Identify scheduling conflicts and suggest solutions  
- Recommend productivity strategies
- Notice patterns and offer insights
- Celebrate completed tasks and progress
        
        PRIORITY 1 (Highest - Urgent/Critical):
        - Keywords: "urgent", "ASAP", "emergency", "critical", "immediately", "now", "crisis"
        - Time: "due today", "overdue", "deadline today", "before [immediate event]"
        - Context: "blocking others", "client emergency", "system down"
        
        PRIORITY 2 (High - Important):
        - Keywords: "important", "crucial", "vital", "key", "priority", "high priority"
        - Time: "due tomorrow", "due this week", "deadline approaching"
        - Context: "for client", "for boss", "presentation", "meeting prep", "deliverable"
        
        PRIORITY 3 (Medium - Normal):
        - Keywords: "should", "need to", "have to", regular task language
        - Time: "due next week", "due this month", specific future dates
        - Context: routine work, regular activities, standard tasks
        
        PRIORITY 4 (Low - Nice to have):
        - Keywords: "could", "might", "would be nice", "when I have time", "if possible"
        - Time: "someday", "eventually", "no rush", "next month"
        - Context: learning, research, improvements, optimization
        
        PRIORITY 5 (Lowest - Someday/Maybe):
        - Keywords: "maybe", "possibly", "consider", "think about", "explore"
        - Time: "no deadline", "future", "long term", "one day"
        - Context: ideas, wishes, distant goals, brainstorming
        
        MIT (Most Important Task) indicators:
        - Explicit: "most important", "top priority", "focus on", "main thing", "MIT"
        - Implicit: Priority 1 + due today, or explicitly marked as daily focus
        - Only mark as MIT if clearly the day's primary focus
        
        When updating tasks:
        - You can change status, due dates, descriptions, priorities, etc.
        - Common status changes: "mark as done" -> "Completed", "cancel" -> "Canceled", "waiting" -> "Waiting"
        - Adjust priority if urgency language changes
        
        When deleting tasks:
        - If user says "cancel my workout" or "delete my presentation task", use find_and_delete_task with the key term ("workout", "presentation")
        - If user provides a specific task ID, use delete_task
        - For ambiguous requests like "cancel task", ask them to be more specific
        
                    Valid task statuses: Open, InProgress, Completed, Waiting, Canceled
            
            ${pendingAction ? `
            🚨🚨🚨 CRITICAL CONTEXT ALERT 🚨🚨🚨:
            
            YOU ARE CURRENTLY IN THE MIDDLE OF A CONVERSATION WITH MITCHELL.
            
            PREVIOUS CONTEXT:
            - Original Request: "${pendingAction.originalRequest}"
            - You asked for clarification and are waiting for Mitchell's response
            - Action Type: ${pendingAction.type}
            - Partial Data: ${JSON.stringify(pendingAction.partialData || {})}
            
            MITCHELL'S CURRENT MESSAGE IS HIS RESPONSE TO YOUR PREVIOUS QUESTION.
            
            MANDATORY ACTIONS:
            1. IMMEDIATELY interpret his response as answering your previous question
            2. PROCEED with ${pendingAction.type} using his answer
            3. DO NOT ask "How can I help you?" - he's already told you!
            4. DO NOT ignore the context - this is a continuation of your previous conversation
            5. USE his response to complete the task creation/update/deletion
            
            EXAMPLES:
            - If you asked "Should this be an MIT?" and he says "yes" → SET isMIT = true and create the task
            - If you asked "When do you want to work out?" and he says "tonight" → CREATE workout task for tonight
            - If you asked "What priority?" and he says "high" → SET priority = 2 and create the task
            
            THE USER IS CONTINUING THE CONVERSATION - ACT ACCORDINGLY!
            ` : ''}`
      };
      
      messages.push(systemMessage);
      
      // Add conversation history (excluding system messages since we already added it)
      const historyMessages = conversationHistory
        .filter(m => m.role !== 'system')
        .map(m => ({ role: m.role, content: m.content }));
      
      messages.push(...historyMessages);
      
      // Add current user message if not already in history
      if (!historyMessages.some(m => m.role === 'user' && m.content === message)) {
        messages.push({ role: 'user', content: message });
      }

      // Call OpenAI GPT-4o with function calling
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.7, // More creative and conversational like ChatGPT
        messages: messages,
        functions: [
          {
            name: "suggest_next_action",
            description: "Suggest what Mitchell should do next based on his current task load, well-being needs, and productivity patterns. Use this when he asks 'what should I do next?' or similar.",
            parameters: {
              type: "object",
              properties: {
                suggestion_type: {
                  type: "string",
                  enum: ["mit_focus", "quick_win", "self_care", "break_needed", "clear_backlog"],
                  description: "Type of suggestion based on current context"
                },
                reasoning: {
                  type: "string",
                  description: "Brief explanation of why this suggestion makes sense"
                },
                suggested_tasks: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Specific task suggestions or types of tasks to consider"
                }
              },
              required: ["suggestion_type", "reasoning"]
            }
          },
          {
            name: "ask_for_clarification",
            description: "Ask the user for clarification about task details like priority, urgency, due date, or tags. Use this when you need more information before creating/updating a task. You can also ask about tag preferences when uncertain.",
            parameters: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "The clarifying question to ask the user - BE HUMAN-LIKE! Examples: 'Should this be work or personal?', 'I'm thinking work and meeting tags - sound good?', 'Ooh, dinner sounds fun! Is this pretty important or more casual?', 'How important is this to you?', 'Since you're meeting people, I'm thinking this is important - sound right?'"
                },
                pendingAction: {
                  type: "object",
                  description: "The action you plan to take after getting clarification",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["create_task", "update_task", "delete_task"],
                      description: "The type of action pending"
                    },
                    partialData: {
                      type: "object",
                      description: "Partial task data collected so far, including suggested tags"
                    },
                    originalRequest: {
                      type: "string",
                      description: "The user's original request"
                    }
                  },
                  required: ["type", "originalRequest"]
                }
              },
              required: ["question", "pendingAction"]
            }
          },
          {
            name: "create_task",
            description: "Create a new task. Use this when the user wants to create a task, including when answering clarifying questions about a task you previously asked about. Example: if you asked about workout timing and they said 'tonight', create the workout task for tonight. ALWAYS include appropriate tags based on content analysis.",
            parameters: {
              type: "object",
              properties: {
                title: {
                  type: "string",
                  description: "The task title"
                },
                description: {
                  type: "string",
                  description: "Optional task description"
                },
                dueDate: {
                  type: "string",
                  description: "Due date in YYYY-MM-DD format"
                },
                status: {
                  type: "string",
                  enum: ["Open", "InProgress", "Completed", "Waiting", "Canceled"],
                  description: "Task status"
                },
                isMIT: {
                  type: "boolean",
                  description: "Whether this is a Most Important Task"
                },
                priority: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Task priority (1 = highest, 5 = lowest). NEVER default to 5 without asking. Analyze context: meetings/appointments with people = priority 2-3, routine tasks = 3-4. ASK for clarification if uncertain: 'This sounds important - is this priority 2 or 3 for you?'"
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "REQUIRED: Task tags - PRIORITIZE RESERVED TAGS FIRST. Reserved tags: 5-min, Creative, Customer, Follow-up, Gratitude, Leader, Personal, Research, Team, Training, Work. Use 1-2 reserved tags if applicable, then add custom tags only if needed. Examples: ['Personal', 'fitness'] for workout, ['Work', 'Team'] for meeting, ['Gratitude', 'Personal'] for thank you note."
                }
              },
              required: ["title", "status", "tags"]
            }
          },
          {
            name: "update_task",
            description: "Update an existing task. When updating, consider if tags should be adjusted based on new information or context.",
            parameters: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "The ID of the task to update"
                },
                title: {
                  type: "string",
                  description: "Updated task title"
                },
                description: {
                  type: "string",
                  description: "Updated task description"
                },
                dueDate: {
                  type: "string",
                  description: "Updated due date in YYYY-MM-DD format"
                },
                status: {
                  type: "string",
                  enum: ["Open", "InProgress", "Completed", "Waiting", "Canceled"],
                  description: "Updated task status"
                },
                isMIT: {
                  type: "boolean",
                  description: "Whether this is a Most Important Task"
                },
                priority: {
                  type: "integer",
                  minimum: 1,
                  maximum: 5,
                  description: "Updated task priority"
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Updated task tags. When user mentions adding tags or provides new context, intelligently update the tag list. If user says 'add work tag', append to existing tags rather than replacing them."
                }
              },
              required: ["taskId"]
            }
          },
          {
            name: "delete_task",
            description: "Delete a task by ID",
            parameters: {
              type: "object",
              properties: {
                taskId: {
                  type: "string",
                  description: "The ID of the task to delete"
                }
              },
              required: ["taskId"]
            }
          },
          {
            name: "find_and_delete_task",
            description: "Find and delete a task by searching for it by title or description",
            parameters: {
              type: "object",
              properties: {
                searchTerm: {
                  type: "string",
                  description: "Search term to find the task (e.g., 'workout', 'quarterly reports')"
                },
                confirmTitle: {
                  type: "string",
                  description: "Optional: specific title to confirm before deleting"
                }
              },
              required: ["searchTerm"]
            }
          },
          {
            name: "analyze_workload",
            description: "Analyze current workload and provide intelligent insights about task distribution, priorities, and recommendations",
            parameters: {
              type: "object",
              properties: {
                includeCompleted: {
                  type: "boolean",
                  description: "Whether to include completed tasks in analysis"
                }
              }
            }
          },
          {
            name: "suggest_task_breakdown",
            description: "Suggest how to break down a complex task into smaller, manageable subtasks",
            parameters: {
              type: "object",
              properties: {
                taskDescription: {
                  type: "string",
                  description: "The complex task to break down"
                },
                timeframe: {
                  type: "string",
                  description: "Available timeframe for completion"
                }
              },
              required: ["taskDescription"]
            }
          },
          {
            name: "get_tasks",
            description: "Get tasks with optional filters - use this to understand current workload before making recommendations",
            parameters: {
              type: "object",
              properties: {
                status: {
                  type: "array",
                  items: {
                    type: "string",
                    enum: ["Open", "InProgress", "Completed", "Waiting", "Canceled"]
                  },
                  description: "Filter by task status"
                },
                tags: {
                  type: "array",
                  items: {
                    type: "string"
                  },
                  description: "Filter by tags"
                },
                search: {
                  type: "string",
                  description: "Search in task titles and descriptions"
                },
                dateFilter: {
                  type: "string",
                  enum: ["pastDue", "dueToday", "dueThisWeek", "dueThisMonth", "noDueDate"],
                  description: "Filter by due date"
                }
              }
            }
          }
        ],
        function_call: "auto"
      });

      const responseMessage = completion.choices[0].message;
      
      // Check if GPT wants to call a function
      if (responseMessage.function_call) {
        const functionName = responseMessage.function_call.name;
        const functionArgs = JSON.parse(responseMessage.function_call.arguments);
        
        // Execute the function
        const result = await this.executeFunction(userId, functionName, functionArgs);
        
        // Clear any pending actions since we're executing a function
        if (functionName !== 'ask_for_clarification') {
          this.clearPendingActions(userId);
        }
        
        // Add assistant's response to conversation with pending action if it's a clarification
        const assistantMessage: ConversationMessage = { 
          role: 'assistant', 
          content: result.message 
        };
        
        // If this was an ask_for_clarification, preserve the pending action
        if (functionName === 'ask_for_clarification') {
          assistantMessage.pendingAction = functionArgs.pendingAction;
          
        }
        
        this.addToConversation(userId, assistantMessage);
        
        // Log the audit event
        await logAuditEvent(userId, {
          userInput: message,
          functionCalled: functionName,
          parameters: functionArgs,
          result: result,
          timestamp: new Date().toISOString()
        });
        
        return {
          success: true,
          message: result.message,
          data: result.data,
          functionCalled: functionName,
          parameters: functionArgs
        };
      } else {
        // GPT responded without calling a function
        const assistantMessage = responseMessage.content || "I understand, but I'm not sure how to help with that specific request.";
        
        // Add assistant's response to conversation
        this.addToConversation(userId, { 
          role: 'assistant', 
          content: assistantMessage 
        });
        
        return {
          success: true,
          message: assistantMessage
        };
      }
      
    } catch (error) {
      console.error('TVAgent processing error:', error);
      
      // Log the error
      await logAuditEvent(userId, {
        userInput: message,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
      
      throw new Error(`Failed to process message: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeFunction(userId: string, functionName: string, args: any): Promise<{ message: string; data?: any }> {
    switch (functionName) {
      case 'suggest_next_action':
        try {
          const allTasks = await getTasksForUser(userId, {
            status: ['Open', 'InProgress', 'Waiting']
          });
          
          const mitTasks = allTasks?.filter(task => task.isMIT) || [];
          const completedToday = await getTasksForUser(userId, {
            status: ['Completed']
          });
          
          let message = "";
          
          switch (args.suggestion_type) {
            case 'mit_focus':
              if (mitTasks.length === 0) {
                message = "🎯 No MITs set yet! Let's identify your most important task for today. What's the one thing that would make today a success?";
              } else {
                message = `🎯 You have ${mitTasks.length} MIT(s) active. Focus on: **${mitTasks[0].title}**. ${args.reasoning}`;
              }
              break;
              
            case 'quick_win':
              message = `⚡ ${args.reasoning} Here are some quick wins you could tackle: ${args.suggested_tasks?.join(', ') || 'small tasks that take 15 minutes or less'}. Want to clear one off your list?`;
              break;
              
            case 'self_care':
              message = `🧘 ${args.reasoning} Consider: **yoga**, **a walk**, **call a friend**, or **gratitude journaling**. Your well-being fuels your productivity!`;
              break;
              
            case 'break_needed':
              message = `☕ ${args.reasoning} Take a breather! Maybe grab some fresh air, stretch, or have a healthy snack. You'll come back refreshed.`;
              break;
              
            case 'clear_backlog':
              message = `📋 ${args.reasoning} Let's tackle some smaller items to clear mental space for your bigger goals. Ready to power through a few?`;
              break;
              
            default:
              message = args.reasoning;
          }
          
          return {
            message: message,
            data: { mitCount: mitTasks.length, totalTasks: allTasks?.length || 0, completedToday: completedToday?.length || 0 }
          };
        } catch (error) {
          return {
            message: `Here's what I suggest: focus on your most important task first, then tackle a quick win. ${args.reasoning}`
          };
        }
      
      case 'ask_for_clarification':
        return {
          message: args.question
        };

      case 'create_task':
        try {
                     const task = await createTask(userId, {
             title: args.title,
             description: args.description,
             dueDate: args.dueDate,
             status: args.status,
             isMIT: args.isMIT || false,
             priority: args.priority || 3,
             tags: args.tags || []
           });
          return {
            message: `Task "${args.title}" created successfully!`,
            data: task
          };
        } catch (error) {
          return {
            message: `Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'update_task':
        try {
          const updatedTask = await updateTask(userId, args.taskId, {
            ...(args.title && { title: args.title }),
            ...(args.description !== undefined && { description: args.description }),
            ...(args.dueDate !== undefined && { dueDate: args.dueDate }),
                         ...(args.status && { status: args.status }),
            ...(args.isMIT !== undefined && { isMIT: args.isMIT }),
            ...(args.priority !== undefined && { priority: args.priority }),
            ...(args.tags !== undefined && { tags: args.tags }),
            ...(args.status === 'Completed' && { completedDate: new Date().toISOString() })
          });
          
          if (!updatedTask) {
            return { message: "Task not found or could not be updated." };
          }
          
          return {
            message: `Task updated successfully!`,
            data: updatedTask
          };
        } catch (error) {
          return {
            message: `Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'delete_task':
        try {
          const success = await deleteTask(userId, args.taskId);
          if (success) {
            return { message: "Task deleted successfully!" };
          } else {
            return { message: "Task not found or could not be deleted." };
          }
        } catch (error) {
          return {
            message: `Failed to delete task: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'find_and_delete_task':
        try {
          // Get all active tasks for semantic matching
          const allTasks = await getTasksForUser(userId, {
            status: ['Open', 'Waiting'] // Only search in active tasks
          });
          
          if (!allTasks || allTasks.length === 0) {
            return { message: "You don't have any active tasks to cancel." };
          }
          
          // Use GPT to intelligently match tasks based on intent
          const taskMatchPrompt = `Given the user's request to find/cancel/delete a task with the term "${args.searchTerm}", 
          which of these tasks is most likely what they're referring to? Consider semantic meaning, not just literal text matches.
          
          For example:
          - "workout" could match "go to gym", "exercise", "fitness class", "run", etc.
          - "meeting" could match "call with client", "conference", "standup", etc.
          - "groceries" could match "shopping", "buy food", "supermarket", etc.
          
          Available tasks:
          ${allTasks.map((task, i) => `${i + 1}. "${task.title}" (${task.description || 'no description'})`).join('\n')}
          
          Respond with ONLY the number(s) of the most likely matching task(s). If multiple tasks could match, list them separated by commas (e.g., "1,3"). If no tasks seem to match, respond with "NONE".`;

          const matchingResponse = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
              {
                role: "user",
                content: taskMatchPrompt
              }
            ],
            max_tokens: 50
          });

          const matchResult = matchingResponse.choices[0].message.content?.trim();
          
          if (!matchResult || matchResult === "NONE") {
            return { 
              message: `No tasks found that match "${args.searchTerm}". Here are your current tasks:`,
              data: allTasks 
            };
          }
          
          // Parse the matching task indices
          const matchIndices = matchResult.split(',').map(n => parseInt(n.trim()) - 1).filter(i => !isNaN(i) && i >= 0 && i < allTasks.length);
          const matchingTasks = matchIndices.map(i => allTasks[i]);
          
          if (matchingTasks.length === 0) {
            return { 
              message: `No clear matches found for "${args.searchTerm}". Here are your current tasks:`,
              data: allTasks 
            };
          }
          
          if (matchingTasks.length === 1) {
            const taskToDelete = matchingTasks[0];
            
            // Delete the task
            const success = await deleteTask(userId, taskToDelete.TaskId);
            if (success) {
              return { 
                message: `Found and deleted task "${taskToDelete.title}" successfully!`,
                data: { deletedTask: taskToDelete }
              };
            } else {
              return { message: "Task could not be deleted." };
            }
          } else {
            // Multiple matches - ask for confirmation
            return {
              message: `Found ${matchingTasks.length} tasks that might match "${args.searchTerm}". Which one did you mean?`,
              data: matchingTasks
            };
          }
        } catch (error) {
          return {
            message: `Failed to find and delete task: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'analyze_workload':
        try {
          const allTasks = await getTasksForUser(userId, {
            status: args.includeCompleted ? undefined : ['Open', 'InProgress', 'Waiting']
          });
          
          if (!allTasks || allTasks.length === 0) {
            return { message: "You don't have any tasks to analyze. Great job staying on top of things!" };
          }
          
          // Use GPT to provide intelligent analysis
          const analysisPrompt = `Analyze this task workload and provide intelligent insights:

${allTasks.map(task => `• ${task.title} (Priority: ${task.priority}, Status: ${task.status}, Due: ${task.dueDate || 'No due date'}, MIT: ${task.isMIT ? 'Yes' : 'No'})`).join('\n')}

Please provide:
1. Workload summary (total tasks, priority distribution)
2. Urgent/overdue items that need immediate attention
3. Productivity insights and patterns
4. Recommendations for better task management
5. Suggestions for prioritization or scheduling

Be conversational, insightful, and helpful like a productivity coach.`;

          const analysisResponse = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: analysisPrompt }],
            temperature: 0.7
          });

          return {
            message: analysisResponse.choices[0].message.content || "I've analyzed your workload but couldn't generate insights.",
            data: allTasks
          };
        } catch (error) {
          return {
            message: `Failed to analyze workload: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'suggest_task_breakdown':
        try {
          const breakdownPrompt = `Help break down this complex task into smaller, manageable subtasks:

Task: ${args.taskDescription}
${args.timeframe ? `Timeframe: ${args.timeframe}` : ''}

Please suggest:
1. 3-7 specific, actionable subtasks
2. Logical order/sequence for completion
3. Estimated time for each subtask
4. Any dependencies between subtasks
5. Tips for successful completion

Be practical and specific. Format as a clear, actionable plan.`;

          const breakdownResponse = await this.openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: breakdownPrompt }],
            temperature: 0.7
          });

          return {
            message: breakdownResponse.choices[0].message.content || "I couldn't generate a breakdown for this task.",
            data: { originalTask: args.taskDescription }
          };
        } catch (error) {
          return {
            message: `Failed to suggest task breakdown: ${error instanceof Error ? error.message : 'Unknown error'}`
          };
        }

      case 'get_tasks':
        try {
          const tasks = await getTasksForUser(userId, {
            status: args.status,
            tags: args.tags,
            search: args.search,
            dateFilter: args.dateFilter
          });
          
          if (!tasks || tasks.length === 0) {
            return {
              message: "You're all caught up! 🎉 No active tasks right now. Want to add something new or maybe take a well-deserved break?",
              data: []
            };
          }

          // Analyze the tasks for a more intelligent response
          const mitTasks = tasks.filter(task => task.isMIT);
          const overdueTasks = tasks.filter(task => {
            if (!task.dueDate) return false;
            const today = new Date().toISOString().split('T')[0];
            return task.dueDate < today;
          });
          const todayTasks = tasks.filter(task => {
            if (!task.dueDate) return false;
            const today = new Date().toISOString().split('T')[0];
            return task.dueDate === today;
          });

          // Create a supportive, human-like response
          let message = "";
          
          if (overdueTasks.length > 0) {
            message = `📅 Hey Mitchell! You've got ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''} that need attention. `;
            message += "Let's tackle those first to clear your mind! ";
          } else if (todayTasks.length > 0) {
            message = `🎯 Good morning! You have ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today. `;
          } else {
            message = `📋 Here's what's on your plate: `;
          }

          if (mitTasks.length > 0) {
            message += `Your top ${mitTasks.length} MIT${mitTasks.length > 1 ? 's' : ''}: **${mitTasks.map(t => t.title).join('**, **')}**. `;
          }

          // Add encouragement and next steps
          if (tasks.length <= 3) {
            message += "Nice manageable list! ";
          } else if (tasks.length <= 6) {
            message += "Solid workload - you've got this! ";
          } else {
            message += "That's quite a list! Consider focusing on your MITs first. ";
          }

          message += "Which one feels right to tackle first?";

          return {
            message,
            data: tasks
          };
        } catch (error) {
          return {
            message: "Hmm, I'm having trouble fetching your tasks right now. Want to try again, or maybe add a new task instead?"
          };
        }

      default:
        return {
          message: `Unknown function: ${functionName}`
        };
    }
  }
} 