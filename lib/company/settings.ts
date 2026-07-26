import { z } from 'zod';
import { DEFAULT_COMPANY_SETTINGS } from './default-settings';

const CompanyBrandingSchema = z.object({
  displayName:    z.string().optional(),
  logoUrl:        z.string().nullable().optional(),
  primaryColor:   z.string().optional(),
  secondaryColor: z.string().optional(),
  accentColor:    z.string().optional(),
});

const CompanyFeaturesSchema = z.object({
  workers:                        z.boolean().optional(),
  documents:                      z.boolean().optional(),
  vehicles:                       z.boolean().optional(),
  heavyEquipment:                 z.boolean().optional(),
  liftingEquipment:               z.boolean().optional(),
  subcontractors:                 z.boolean().optional(),
  reports:                        z.boolean().optional(),
  customWorkerFields:             z.boolean().optional(),
  customDocumentCategories:       z.boolean().optional(),
  customVehicleFields:            z.boolean().optional(),
  vehicleAssignmentToWorker:      z.boolean().optional(),
  vehicleAssignmentToSubcontractor: z.boolean().optional(),
});

const CompanyUiSchema = z.object({
  dashboardVariant:    z.enum(['default', 'compact', 'enterprise']).optional(),
  workerFormVariant:   z.enum(['default', 'extended']).optional(),
  workerListVariant:   z.enum(['default', 'compact']).optional(),
  vehicleListVariant:  z.enum(['default', 'compact']).optional(),
  showEmployeeNumber:  z.boolean().optional(),
  showProjectSelector: z.boolean().optional(),
});

export const CompanySettingsSchema = z.object({
  branding: CompanyBrandingSchema.optional(),
  features: CompanyFeaturesSchema.optional(),
  ui:       CompanyUiSchema.optional(),
});

export type CompanySettings = z.infer<typeof CompanySettingsSchema>;

export interface CompanyBranding {
  displayName:    string | undefined;
  logoUrl:        string | null;
  primaryColor:   string;
  secondaryColor: string;
  accentColor:    string;
}

export interface CompanyFeatures {
  workers:                        boolean;
  documents:                      boolean;
  vehicles:                       boolean;
  heavyEquipment:                 boolean;
  liftingEquipment:               boolean;
  subcontractors:                 boolean;
  reports:                        boolean;
  customWorkerFields:             boolean;
  customDocumentCategories:       boolean;
  customVehicleFields:            boolean;
  vehicleAssignmentToWorker:      boolean;
  vehicleAssignmentToSubcontractor: boolean;
}

export interface CompanyUi {
  dashboardVariant:    'default' | 'compact' | 'enterprise';
  workerFormVariant:   'default' | 'extended';
  workerListVariant:   'default' | 'compact';
  vehicleListVariant:  'default' | 'compact';
  showEmployeeNumber:  boolean;
  showProjectSelector: boolean;
}

export interface ResolvedCompanySettings {
  branding: CompanyBranding;
  features: CompanyFeatures;
  ui:       CompanyUi;
}

export function resolveCompanySettings(raw: unknown): ResolvedCompanySettings {
  const parsed = CompanySettingsSchema.safeParse(raw ?? {});
  const partial = parsed.success ? parsed.data : {};
  const defaults = DEFAULT_COMPANY_SETTINGS;

  return {
    branding: {
      displayName:    partial.branding?.displayName    ?? defaults.branding.displayName,
      logoUrl:        partial.branding?.logoUrl        ?? defaults.branding.logoUrl        ?? null,
      primaryColor:   partial.branding?.primaryColor   ?? defaults.branding.primaryColor   ?? '#f97316',
      secondaryColor: partial.branding?.secondaryColor ?? defaults.branding.secondaryColor ?? '#3b82f6',
      accentColor:    partial.branding?.accentColor    ?? defaults.branding.accentColor    ?? '#10b981',
    },
    features: {
      workers:                        partial.features?.workers                        ?? defaults.features.workers,
      documents:                      partial.features?.documents                      ?? defaults.features.documents,
      vehicles:                       partial.features?.vehicles                       ?? defaults.features.vehicles,
      heavyEquipment:                 partial.features?.heavyEquipment                 ?? defaults.features.heavyEquipment,
      liftingEquipment:               partial.features?.liftingEquipment               ?? defaults.features.liftingEquipment,
      subcontractors:                 partial.features?.subcontractors                 ?? defaults.features.subcontractors,
      reports:                        partial.features?.reports                        ?? defaults.features.reports,
      customWorkerFields:             partial.features?.customWorkerFields             ?? defaults.features.customWorkerFields,
      customDocumentCategories:       partial.features?.customDocumentCategories       ?? defaults.features.customDocumentCategories,
      customVehicleFields:            partial.features?.customVehicleFields            ?? defaults.features.customVehicleFields,
      vehicleAssignmentToWorker:      partial.features?.vehicleAssignmentToWorker      ?? defaults.features.vehicleAssignmentToWorker,
      vehicleAssignmentToSubcontractor: partial.features?.vehicleAssignmentToSubcontractor ?? defaults.features.vehicleAssignmentToSubcontractor,
    },
    ui: {
      dashboardVariant:    partial.ui?.dashboardVariant    ?? defaults.ui.dashboardVariant,
      workerFormVariant:   partial.ui?.workerFormVariant   ?? defaults.ui.workerFormVariant,
      workerListVariant:   partial.ui?.workerListVariant   ?? defaults.ui.workerListVariant,
      vehicleListVariant:  partial.ui?.vehicleListVariant  ?? defaults.ui.vehicleListVariant,
      showEmployeeNumber:  partial.ui?.showEmployeeNumber  ?? defaults.ui.showEmployeeNumber,
      showProjectSelector: partial.ui?.showProjectSelector ?? defaults.ui.showProjectSelector,
    },
  };
}

export function isFeatureEnabled(
  settings: ResolvedCompanySettings,
  feature: keyof CompanyFeatures
): boolean {
  return settings.features[feature];
}

export function getCompanyBranding(settings: ResolvedCompanySettings): CompanyBranding {
  return settings.branding;
}

export function getUiVariant<K extends keyof CompanyUi>(
  settings: ResolvedCompanySettings,
  key: K
): CompanyUi[K] {
  return settings.ui[key];
}
