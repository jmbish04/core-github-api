/**
 * @agent-context
 * Type definitions for the Research Project Editor multi-step wizard.
 * These types define the structural contracts for all child components, ensuring seamless state sharing between Config, Validation, and Review steps.
 */

export interface ProjectEditorConfigProps {
  formData: any;
  handleChange: (field: string, value: any) => void;
  distinctTerms: { github: string[], discord: string[], google: string[] };
  cronPrompt: string;
  setCronPrompt: (prompt: string) => void;
  handleGenerateCron: (preset?: string) => Promise<void>;
  generatingCron: boolean;
  availableDiscordChannels: any[];
  selectedSource: string;
  setSelectedSource: (source: string) => void;
  generalKeywords: string;
  setGeneralKeywords: (kw: string) => void;
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  improvingKeywords: boolean;
  setImprovingKeywords: (improving: boolean) => void;
  testingDispatch: boolean;
  handleDiagnosticTest: () => Promise<void>;
  dispatchResultLink: string;
  saving: boolean;
  handleTestSearch: () => Promise<void>;
  api: any;
}

export interface ProjectEditorValidationProps {
  testResults: any;
  testing: boolean;
  setStep: (step: 1 | 2 | 3) => void;
  handleProceedToReview: () => Promise<void>;
}

export interface ProjectEditorReviewProps {
  formData: any;
  handleLaunch: () => Promise<void>;
}
