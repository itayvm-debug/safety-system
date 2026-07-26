import type { ResolvedCompanySettings } from './settings';

export const DEFAULT_COMPANY_SETTINGS: ResolvedCompanySettings = {
  branding: {
    displayName:    undefined,
    logoUrl:        null,
    primaryColor:   '#f97316',
    secondaryColor: '#3b82f6',
    accentColor:    '#10b981',
  },
  features: {
    workers:                        true,
    documents:                      true,
    vehicles:                       true,
    heavyEquipment:                 true,
    liftingEquipment:               true,
    subcontractors:                 true,
    reports:                        true,
    customWorkerFields:             false,
    customDocumentCategories:       false,
    customVehicleFields:            false,
    vehicleAssignmentToWorker:      true,
    vehicleAssignmentToSubcontractor: true,
  },
  ui: {
    dashboardVariant:    'default',
    workerFormVariant:   'default',
    workerListVariant:   'default',
    vehicleListVariant:  'default',
    showEmployeeNumber:  false,
    showProjectSelector: true,
  },
};
