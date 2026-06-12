import { defineEdgeType } from "@sutra/ontology-core";
import {
  Batch,
  ComplaintCluster,
  Component,
  Device,
  PurchaseOrder,
  ServiceTicket,
  Supplier,
  SupplierLot,
  TelemetryAnomaly,
  WarrantyClaim,
} from "./entities";

export const USES_LOT = defineEdgeType("USES_LOT", { src: Batch, dst: SupplierLot });
export const SUPPLIED_BY = defineEdgeType("SUPPLIED_BY", { src: SupplierLot, dst: Supplier });
export const LOT_OF = defineEdgeType("LOT_OF", { src: SupplierLot, dst: Component });
export const SUPPLIES = defineEdgeType("SUPPLIES", { src: PurchaseOrder, dst: Component });
export const FOR_LOT = defineEdgeType("FOR_LOT", { src: PurchaseOrder, dst: SupplierLot });
export const BUILT_IN = defineEdgeType("BUILT_IN", { src: Device, dst: Batch });
export const ABOUT = defineEdgeType("ABOUT", { src: ServiceTicket, dst: Device });
export const CLUSTERS = defineEdgeType("CLUSTERS", { src: ComplaintCluster, dst: ServiceTicket });
export const CLAIMS = defineEdgeType("CLAIMS", { src: WarrantyClaim, dst: Device });
export const OBSERVED_ON = defineEdgeType("OBSERVED_ON", { src: TelemetryAnomaly, dst: Device });

export const EDGES = [
  USES_LOT,
  SUPPLIED_BY,
  LOT_OF,
  SUPPLIES,
  FOR_LOT,
  BUILT_IN,
  ABOUT,
  CLUSTERS,
  CLAIMS,
  OBSERVED_ON,
];
