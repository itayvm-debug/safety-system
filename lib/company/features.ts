import type { CompanyFeatures, ResolvedCompanySettings } from './settings';

export function requireFeature(
  settings: ResolvedCompanySettings,
  feature: keyof CompanyFeatures
): void {
  if (!settings.features[feature]) {
    throw new Error(`Feature "${feature}" is disabled for this company`);
  }
}

export const FEATURE_LABELS: Record<keyof CompanyFeatures, string> = {
  workers:                        'עובדים',
  documents:                      'מסמכים',
  vehicles:                       'רכבים',
  heavyEquipment:                 'כלי צמ"ה',
  liftingEquipment:               'ציוד הרמה',
  subcontractors:                 'קבלני משנה',
  reports:                        'דוחות',
  customWorkerFields:             'שדות עובד מותאמים',
  customDocumentCategories:       'קטגוריות מסמך מותאמות',
  customVehicleFields:            'שדות רכב מותאמים',
  vehicleAssignmentToWorker:      'שיוך רכב לעובד',
  vehicleAssignmentToSubcontractor: 'שיוך רכב לקבלן משנה',
};
