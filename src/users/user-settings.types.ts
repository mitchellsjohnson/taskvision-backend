export interface SmsConfig {
  phoneNumber?: string;          // E.164 format (e.g., +15551234567)
  smsKey?: string;               // 4-digit authentication key
  verified: boolean;             // Phone verification status
  verificationCodeSentAt?: string; // ISO timestamp for verification attempts
  enabledNotifications?: {
    dailySummary?: boolean;      // Daily MIT summary
    taskReminders?: boolean;     // Reminders for due tasks
    mitReminders?: boolean;      // Reminders for MIT tasks
  };
  preferredTime?: string;        // ISO time for daily summaries (e.g., "09:00")
  dailyLimitRemaining?: number;  // SMS quota remaining today (resets daily)
  lastResetDate?: string;        // ISO date for daily limit reset
  createdAt?: string;
  updatedAt?: string;
}

export interface UserSettings {
  userId: string;
  theme: 'system' | 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large' | 'extra-large' | 'extra-extra-large';
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    alwaysShowFocus: boolean;
  };
  smsConfig?: SmsConfig;         // SMS/text message configuration
  createdAt: string;
  updatedAt: string;
}

export type UserSettingsUpdate = Partial<Omit<UserSettings, 'userId' | 'createdAt' | 'updatedAt'>>;
