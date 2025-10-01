export interface UserSettings {
  userId: string;
  theme: 'system' | 'light' | 'dark';
  fontSize: 'small' | 'medium' | 'large' | 'extra-large' | 'extra-extra-large';
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    alwaysShowFocus: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export type UserSettingsUpdate = Partial<Omit<UserSettings, 'userId' | 'createdAt' | 'updatedAt'>>;
