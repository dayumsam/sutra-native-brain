// Carried through every request and job; the ontology and all storage
// operations are resolved/scoped by it. Never default it.
export type TenantContext = {
  tenantId: string;
};
