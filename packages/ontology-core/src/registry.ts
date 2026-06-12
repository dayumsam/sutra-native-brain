import type { Ontology } from "./ontology";

export class OntologyRegistry {
  private readonly tenants = new Map<string, Ontology>();

  register(tenantId: string, ontology: Ontology): void {
    this.tenants.set(tenantId, ontology);
  }

  get(tenantId: string): Ontology {
    const ontology = this.tenants.get(tenantId);
    if (!ontology) {
      throw new Error(`No ontology registered for tenant "${tenantId}"`);
    }
    return ontology;
  }

  tenantIds(): string[] {
    return [...this.tenants.keys()];
  }
}
