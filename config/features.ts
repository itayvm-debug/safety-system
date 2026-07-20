/**
 * config/features.ts — Feature Flags
 * ניתן לשלוט על פיצ'רים לפי לקוח או שלב פיתוח
 */

export const FEATURES = {
  // Core features — תמיד פעיל
  workers:              true,
  documents:            true,
  vehicles:             true,
  heavyEquipment:       true,
  liftingEquipment:     true,
  subcontractors:       true,
  safetyBriefings:      true,
  heightRestrictions:   true,

  // Optional features
  aiWorkerIdentity:     true,   // Anthropic Claude API
  offlineMode:          true,   // PWA + Service Worker
  cameraCapture:        true,   // צילום מהמצלמה
  weeklyEmailReport:    true,   // Cron + Resend
  siteFeedback:         true,   // משוב משתמשים
  dataExport:           true,   // ייצוא ZIP

  // Production readiness flags (internal only — never show to users)
  externalLegalReviewCompleted:             false,
  externalAccessibilityCertificationCompleted: false,
  penetrationTestCompleted:                 false,
  durableRateLimitingEnabled:              false,
  mfaEnabled:                              false,
} as const;
