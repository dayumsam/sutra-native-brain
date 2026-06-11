// Static demo dataset. All data is fictional — no real Urban Company customer data.

export type Domain =
  | "product"
  | "component"
  | "supplier"
  | "manufacturing"
  | "inventory"
  | "service"
  | "warranty"
  | "telemetry"
  | "quality"
  | "field"
  | "action";

export type GraphNodeDef = {
  id: string;
  label: string;
  domain: Domain;
  x: number;
  y: number;
  fields?: [string, string][];
};

export type GraphEdgeDef = {
  id: string;
  from: string;
  to: string;
};

export type RetrievalStep = {
  nodeId: string;
  record: string; // e.g. "service_tickets/ST-1048"
  detail: string; // plain-language note about what was read
};

export type Recommendation = {
  action: string;
  why: string[];
};

export type Artifact = {
  id: string;
  kind: "Email draft" | "Checklist" | "Task" | "Memo";
  title: string;
  meta?: string;
  lines: string[];
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  triggerSource: string;
  trigger: string;
  retrieval: RetrievalStep[];
  response: {
    headline: string;
    narrative: string;
    facts: [string, string][];
    recommendations: Recommendation[];
    artifacts: Artifact[];
  };
};

// Dot colors tuned for the dark graph canvas — pink/blue network-graph palette
export const DOMAIN_META: Record<Domain, { label: string; color: string }> = {
  product: { label: "Product", color: "#7c8cf8" },
  component: { label: "Components", color: "#45c4b0" },
  supplier: { label: "Suppliers", color: "#ec5f9f" },
  manufacturing: { label: "Manufacturing", color: "#5165d6" },
  inventory: { label: "Inventory", color: "#38bdf8" },
  service: { label: "Service", color: "#f4799f" },
  warranty: { label: "Warranty", color: "#c2498d" },
  telemetry: { label: "App telemetry", color: "#67d1ee" },
  quality: { label: "Quality", color: "#a06ef5" },
  field: { label: "Field ops", color: "#4f9cf0" },
  action: { label: "Approvals", color: "#8d93b8" },
};

// ---------------------------------------------------------------------------
// Graph — node positions are starting points; every node is draggable
// ---------------------------------------------------------------------------

export const NODES: GraphNodeDef[] = [
  // Product (center)
  {
    id: "prod_m1", label: "Native M1", domain: "product", x: 660, y: 320,
    fields: [["Model", "M1-2L"], ["Capacity", "2.0 L/hr"], ["Stages", "5-stage RO"], ["Status", "Active"], ["SKUs", "3"]],
  },
  {
    id: "prod_m2", label: "Native M2", domain: "product", x: 760, y: 380,
    fields: [["Model", "M2-3L"], ["Capacity", "3.0 L/hr"], ["Stages", "6-stage RO"], ["Launched", "Oct 2025"], ["Active units", "24,800"]],
  },
  {
    id: "prod_m2_pro", label: "Native M2 Pro", domain: "product", x: 650, y: 430,
    fields: [["Model", "M2P-4L"], ["Capacity", "4.2 L/hr"], ["Stages", "7-stage RO"], ["Launched", "Jan 2026"], ["SKUs", "2"]],
  },
  {
    id: "packaging", label: "Packaging claims", domain: "product", x: 760, y: 485,
    fields: [["TDS claim", "< 25 ppm"], ["Purity claim", "99.9%"], ["Warranty claim", "2 years"], ["Last updated", "Nov 2025"], ["ECO pending", "ECO-214"]],
  },

  // Components (center-left)
  {
    id: "comp_pump", label: "Pump P-200", domain: "component", x: 480, y: 310,
    fields: [["Part no.", "P-200-C"], ["Rated flow", "3.2 L/min"], ["Voltage", "24V DC"], ["MTBF", "18,000 hr"], ["Current lot", "P-88A"]],
  },
  {
    id: "comp_membrane_v2", label: "MemPure V2 membrane", domain: "component", x: 440, y: 405,
    fields: [["Part no.", "M-V2"], ["Rejection rate", "97.8%"], ["Rated flow", "3.0 L/min"], ["Service life", "12 months"], ["Stock", "8,700 units"]],
  },
  {
    id: "comp_membrane_v3", label: "AquaClear V3 (candidate)", domain: "component", x: 350, y: 465,
    fields: [["Part no.", "ACV3-01"], ["Rejection rate", "97.2%"], ["Rated flow", "3.4 L/min"], ["Status", "Candidate"], ["ECO", "ECO-214"]],
  },
  {
    id: "comp_prefilter", label: "Sediment pre-filter", domain: "component", x: 545, y: 485,
    fields: [["Part no.", "PF-R4"], ["Micron rating", "5 μm"], ["Service life", "3 months"], ["BLR stock", "214 units"], ["Supplier", "In-house"]],
  },

  // Suppliers (far left)
  {
    id: "supplier_email", label: "Supplier email", domain: "supplier", x: 60, y: 215,
    fields: [["From", "AquaMotion Components"], ["Received", "today 07:58"], ["Re", "PO-4472 delay"], ["Delay", "+10 days"], ["Partial ship", "Not confirmed"]],
  },
  {
    id: "sup_flowdrive", label: "FlowDrive Systems", domain: "supplier", x: 195, y: 225,
    fields: [["Location", "Pune"], ["Lead time", "14 days"], ["Rating", "4.6 / 5"], ["Component", "Pump P-200 (alt)"], ["Status", "Qualified"]],
  },
  {
    id: "sup_aquamotion", label: "AquaMotion Components", domain: "supplier", x: 110, y: 300,
    fields: [["Location", "Chennai"], ["Lead time", "21 days"], ["Rating", "3.9 / 5"], ["Open POs", "1 (PO-4472)"], ["Status", "On watch"]],
  },
  {
    id: "po_4472", label: "PO-4472 · 12,000 pumps", domain: "supplier", x: 290, y: 290,
    fields: [["Qty", "12,000 pumps"], ["Value", "₹38.4 L"], ["Original ETA", "Jun 8"], ["Revised ETA", "Jun 18"], ["Status", "Delayed"]],
  },
  {
    id: "sup_mempure", label: "MemPure Technologies", domain: "supplier", x: 105, y: 390,
    fields: [["Location", "Hyderabad"], ["Lead time", "28 days"], ["Rating", "4.4 / 5"], ["Open POs", "4"], ["Status", "Active"]],
  },
  {
    id: "po_membrane", label: "Open membrane POs (4)", domain: "supplier", x: 255, y: 380,
    fields: [["Open POs", "4"], ["Total qty", "22,400 units"], ["Next due", "6,000 on Jun 12"], ["Value", "₹67.2 L"], ["Supplier", "MemPure Technologies"]],
  },
  {
    id: "sup_aquaclear", label: "AquaClear Systems", domain: "supplier", x: 140, y: 480,
    fields: [["Location", "Bengaluru"], ["Lead time", "21 days"], ["Rating", "4.1 / 5"], ["Component", "AquaClear V3"], ["Status", "Evaluation"]],
  },

  // Manufacturing (top-left)
  {
    id: "pump_lot_p88a", label: "Pump lot P-88A", domain: "manufacturing", x: 310, y: 170,
    fields: [["Lot no.", "P-88A"], ["Qty produced", "4,800 units"], ["Built", "Jan 2026"], ["Supplier", "AquaMotion"], ["Status", "Under investigation"]],
  },
  {
    id: "batch_0529", label: "Batch M2-0529", domain: "manufacturing", x: 440, y: 130,
    fields: [["Batch", "M2-0529"], ["Units", "100"], ["Built", "Feb 2026"], ["Line", "Line 2"], ["Pump lot", "P-88A"]],
  },
  {
    id: "batch_0602", label: "Batch M2-0602", domain: "manufacturing", x: 565, y: 100,
    fields: [["Batch", "M2-0602"], ["Units", "111"], ["Built", "Mar 2026"], ["Line", "Line 1"], ["Pump lot", "P-88A"]],
  },
  {
    id: "qc_records", label: "QC test records", domain: "manufacturing", x: 670, y: 145,
    fields: [["Last run", "Feb 2026"], ["Tests", "EOL pressure, leak"], ["Result", "Passed"], ["Fatigue test", "Not run"], ["Gap", "No long-cycle test"]],
  },

  // Quality (top-center)
  {
    id: "complaint_cluster", label: "Complaint cluster · pump noise", domain: "quality", x: 800, y: 95,
    fields: [["Affected devices", "418"], ["Period", "14 days"], ["Trend", "+3.2× vs prior 14d"], ["Symptom", "Abnormal pump noise"], ["Cities", "5"]],
  },
  {
    id: "capa_draft", label: "CAPA draft", domain: "quality", x: 930, y: 140,
    fields: [["ID", "CAPA-201"], ["Stage", "Draft"], ["Owner", "Quality team"], ["Problem", "Pump lot P-88A noise"], ["Due", "TBD"]],
  },
  {
    id: "change_request", label: "ECO-214 · membrane change", domain: "quality", x: 290, y: 550,
    fields: [["ECO no.", "ECO-214"], ["Change", "RO membrane supplier switch"], ["From", "MemPure V2"], ["To", "AquaClear V3"], ["Status", "Under review"]],
  },
  {
    id: "validation", label: "Validation protocol", domain: "quality", x: 450, y: 560,
    fields: [["Tests", "5"], ["Status", "Not started"], ["Est. duration", "6 weeks"], ["Blocker", "Approval pending"], ["Owner", "Quality + Product"]],
  },

  // Inventory (top-right)
  {
    id: "inv_pump_south", label: "Pump stock · South WH", domain: "inventory", x: 1075, y: 110,
    fields: [["On hand", "1,820 units"], ["On order", "3,000 (PO-4472)"], ["Cover", "~8.5 days"], ["Reorder point", "1,500"], ["Location", "South WH"]],
  },
  {
    id: "inv_pump_west", label: "Pump stock · West WH", domain: "inventory", x: 1215, y: 150,
    fields: [["On hand", "3,200 units"], ["On order", "0"], ["Cover", "~18 days"], ["Location", "West WH"], ["Transfer available", "Yes"]],
  },
  {
    id: "inv_prefilter_blr", label: "Pre-filter stock · BLR", domain: "inventory", x: 1020, y: 180,
    fields: [["Part", "PF-R4"], ["On hand", "214 kits"], ["Location", "Bengaluru WH"], ["Reserved", "1 (ticket ST-1048)"], ["Reorder point", "50"]],
  },
  {
    id: "inv_membrane", label: "Membrane stock · 8,700u", domain: "inventory", x: 1150, y: 220,
    fields: [["On hand", "8,700 units"], ["Open POs", "4"], ["Next receipt", "6,000 on Jun 12"], ["Cover", "~22 weeks"], ["Part", "MemPure V2"]],
  },

  // Service (right)
  {
    id: "customer", label: "Customer · Bengaluru", domain: "service", x: 1260, y: 300,
    fields: [["ID", "BLR-20114"], ["Area", "Bengaluru South"], ["Subscription", "Active"], ["Devices", "1"], ["Since", "Feb 2026"]],
  },
  {
    id: "ticket_st1048", label: "Ticket ST-1048", domain: "service", x: 1185, y: 360,
    fields: [["Ticket", "ST-1048"], ["Status", "Open"], ["Symptom", "Low water flow"], ["Created", "today 09:41"], ["Device", "NM2-8841"]],
  },
  {
    id: "serial", label: "Device NM2-8841", domain: "service", x: 1085, y: 330,
    fields: [["Serial", "NM2-8841"], ["Model", "Native M2"], ["Installed", "Feb 2026"], ["Batch", "M2-0529"], ["Age", "4 months"]],
  },
  {
    id: "install_record", label: "Install record 7742", domain: "service", x: 1000, y: 375,
    fields: [["Record", "Install-7742"], ["Date", "Feb 12 2026"], ["Technician", "R. Kumar"], ["Inlet pressure", "Normal"], ["TDS at install", "640 ppm"]],
  },
  {
    id: "similar_tickets", label: "67 similar cases", domain: "service", x: 1100, y: 430,
    fields: [["Cases", "67"], ["Area", "Bengaluru South"], ["Period", "30 days"], ["Fix rate", "82% pre-filter"], ["Escalated", "2"]],
  },
  {
    id: "tech_notes", label: "Technician notes", domain: "service", x: 1250, y: 440,
    fields: [["Source cases", "418"], ["Top fix", "Pump replacement (83%)"], ["Avg time on site", "38 min"], ["Part used", "PF-R4 or pump P-200"], ["Note", "Noise onset 20–35 days post-install"]],
  },
  {
    id: "tech_slots", label: "Technician slots", domain: "service", x: 1165, y: 495,
    fields: [["Next slot", "tomorrow 10:00–12:00"], ["Technician", "R. Kumar"], ["Zone", "Bengaluru South"], ["ETA travel", "~25 min"], ["Slot reserved", "No"]],
  },
  {
    id: "tech_manual", label: "Technician manual", domain: "service", x: 985, y: 520,
    fields: [["Version", "2.1"], ["Updated", "Mar 2026"], ["Covers", "M2 Pro service procedures"], ["Pending", "AquaClear V3 section"], ["ECO ref", "ECO-214"]],
  },

  // Warranty (bottom-right)
  {
    id: "warranty_policy", label: "Warranty policy", domain: "warranty", x: 1140, y: 575,
    fields: [["Term", "2 years"], ["Covers", "Parts + labour"], ["Filters", "Included"], ["Visit limit", "Unlimited"], ["Version", "v3, Dec 2025"]],
  },
  {
    id: "warranty_claims", label: "Warranty claims", domain: "warranty", x: 1245, y: 615,
    fields: [["Open claims", "38"], ["30-day new", "+22"], ["Avg value", "₹2,100"], ["Pump-noise claims", "14"], ["Total liability", "₹18.4 L est."]],
  },
  {
    id: "warranty_exposure", label: "Exposure est. ₹18.4L", domain: "warranty", x: 1060, y: 650,
    fields: [["Affected devices", "418"], ["Avg repair cost", "₹4,400"], ["Total est.", "₹18.4 L"], ["Parts", "₹11.2 L"], ["Labour", "₹7.2 L"]],
  },

  // Telemetry (bottom-center)
  {
    id: "telemetry", label: "Telemetry NM2-8841", domain: "telemetry", x: 785, y: 600,
    fields: [["Last sync", "2 hr ago"], ["Data points", "2,160"], ["Active alerts", "2"], ["Interval", "10 min"], ["Coverage", "90 days"]],
  },
  {
    id: "flow_trend", label: "Flow rate trend", domain: "telemetry", x: 875, y: 650,
    fields: [["Current", "1.1 L/min"], ["Baseline", "1.8 L/min"], ["Change", "−38%"], ["Period", "12 days"], ["Trend", "Declining"]],
  },
  {
    id: "filter_health", label: "Filter health", domain: "telemetry", x: 700, y: 655,
    fields: [["Score", "42 / 100"], ["Expected score", "68 / 100"], ["Decline rate", "Accelerated"], ["Filter age", "4 months"], ["Next due", "~2 months (at current rate)"]],
  },
  {
    id: "water_profile", label: "Water source profile", domain: "telemetry", x: 610, y: 610,
    fields: [["Source", "Borewell"], ["Avg TDS", "680 ppm"], ["Area", "Bengaluru South"], ["Hardness", "High"], ["Seasonal peak", "Mar–Jun"]],
  },

  // Field ops (bottom-left)
  {
    id: "city_demand", label: "City demand forecast", domain: "field", x: 380, y: 640,
    fields: [["Period", "Next 30 days"], ["Forecast units", "3,400"], ["Top city", "Bengaluru (1,240)"], ["At risk", "340 (delayed)"], ["Model", "M2 + M2 Pro"]],
  },
  {
    id: "city_blr", label: "Bengaluru South", domain: "field", x: 480, y: 690,
    fields: [["Active devices", "8,340"], ["30d installs", "1,240"], ["Pending backlog", "620"], ["TDS profile", "High (avg 680 ppm)"], ["Open tickets", "74"]],
  },
  {
    id: "city_del", label: "Delhi NCR", domain: "field", x: 280, y: 700,
    fields: [["Active devices", "5,120"], ["30d installs", "840"], ["Pending backlog", "480"], ["TDS profile", "Medium (avg 420 ppm)"], ["Open tickets", "31"]],
  },
  {
    id: "city_hyd", label: "Hyderabad", domain: "field", x: 175, y: 650,
    fields: [["Active devices", "3,800"], ["30d installs", "620"], ["Pending backlog", "310"], ["TDS profile", "High (avg 590 ppm)"], ["Open tickets", "28"]],
  },
  {
    id: "install_backlog", label: "Install backlog · 1,840", domain: "field", x: 120, y: 575,
    fields: [["Total backlog", "1,840"], ["Delayed > 3d", "340"], ["Avg wait", "4.2 days"], ["Cause", "Pump stock shortage"], ["Recovery ETA", "Jun 18"]],
  },

  // Approvals
  {
    id: "approval_chain", label: "Approval chain", domain: "action", x: 575, y: 550,
    fields: [["Steps", "5"], ["Current step", "Product review"], ["Pending", "Quality, Supply Chain, Ops, Finance"], ["ECO", "ECO-214"], ["SLA", "3 days / step"]],
  },
];

let seq = 0;
const e = (from: string, to: string): GraphEdgeDef => ({ id: `e${seq++}`, from, to });

export const EDGES: GraphEdgeDef[] = [
  // product ↔ components
  e("comp_pump", "prod_m1"),
  e("comp_pump", "prod_m2"),
  e("comp_membrane_v2", "prod_m2_pro"),
  e("comp_prefilter", "prod_m1"),
  e("comp_prefilter", "prod_m2"),
  e("comp_prefilter", "prod_m2_pro"),

  // suppliers
  e("sup_aquamotion", "comp_pump"),
  e("sup_flowdrive", "comp_pump"),
  e("sup_mempure", "comp_membrane_v2"),
  e("sup_aquaclear", "comp_membrane_v3"),
  e("supplier_email", "sup_aquamotion"),
  e("sup_aquamotion", "po_4472"),
  e("po_4472", "comp_pump"),
  e("sup_mempure", "po_membrane"),
  e("po_membrane", "inv_membrane"),

  // manufacturing
  e("sup_aquamotion", "pump_lot_p88a"),
  e("pump_lot_p88a", "batch_0529"),
  e("pump_lot_p88a", "batch_0602"),
  e("batch_0529", "prod_m2"),
  e("batch_0602", "prod_m2"),
  e("qc_records", "batch_0529"),
  e("qc_records", "batch_0602"),

  // quality
  e("complaint_cluster", "similar_tickets"),
  e("complaint_cluster", "qc_records"),
  e("qc_records", "capa_draft"),
  e("warranty_exposure", "capa_draft"),
  e("change_request", "comp_membrane_v2"),
  e("change_request", "comp_membrane_v3"),
  e("change_request", "validation"),
  e("validation", "approval_chain"),

  // inventory
  e("comp_pump", "inv_pump_south"),
  e("comp_pump", "inv_pump_west"),
  e("comp_prefilter", "inv_prefilter_blr"),
  e("comp_membrane_v2", "inv_membrane"),

  // service
  e("ticket_st1048", "customer"),
  e("ticket_st1048", "serial"),
  e("serial", "prod_m2"),
  e("serial", "install_record"),
  e("serial", "batch_0529"),
  e("ticket_st1048", "similar_tickets"),
  e("similar_tickets", "tech_notes"),
  e("similar_tickets", "city_blr"),
  e("tech_notes", "serial"),
  e("ticket_st1048", "tech_slots"),
  e("inv_prefilter_blr", "tech_slots"),
  e("prod_m2_pro", "tech_manual"),
  e("prod_m2_pro", "packaging"),

  // warranty
  e("prod_m2", "warranty_policy"),
  e("ticket_st1048", "warranty_policy"),
  e("warranty_claims", "warranty_exposure"),
  e("similar_tickets", "warranty_claims"),
  e("prod_m2_pro", "warranty_claims"),

  // telemetry
  e("serial", "telemetry"),
  e("telemetry", "flow_trend"),
  e("telemetry", "filter_health"),
  e("install_record", "water_profile"),

  // field ops
  e("prod_m2", "city_demand"),
  e("city_demand", "city_blr"),
  e("city_demand", "city_del"),
  e("city_demand", "city_hyd"),
  e("city_demand", "install_backlog"),

  // ECO extras
  e("comp_membrane_v3", "sup_aquaclear"),
  e("packaging", "approval_chain"),
  e("tech_manual", "approval_chain"),
];

// ---------------------------------------------------------------------------
// Satellite records — leaf nodes that fan out around hubs so the graph reads
// as a dense operational network. They never appear in workflow retrievals.
// ---------------------------------------------------------------------------

type SatelliteGroup = { hub: string; domain: Domain; labels: string[] };

const SATELLITE_GROUPS: SatelliteGroup[] = [
  { hub: "similar_tickets", domain: "service", labels: ["ST-1012", "ST-1019", "ST-1027", "ST-1033", "ST-1041", "ST-1052", "ST-1060"] },
  { hub: "warranty_claims", domain: "warranty", labels: ["WC-2201", "WC-2214", "WC-2226", "WC-2231", "WC-2240"] },
  { hub: "telemetry", domain: "telemetry", labels: ["Daily TDS series", "Pump cycles", "Pressure events", "Uptime log"] },
  { hub: "qc_records", domain: "manufacturing", labels: ["QC run 0529-A", "QC run 0529-B", "QC run 0602-A", "Pressure test log", "Leak test log"] },
  { hub: "city_blr", domain: "field", labels: ["HSR zone", "Koramangala", "Whitefield", "Sarjapur"] },
  { hub: "city_del", domain: "field", labels: ["Gurugram", "Noida", "Dwarka"] },
  { hub: "city_hyd", domain: "field", labels: ["Gachibowli", "Madhapur", "Kukatpally"] },
  { hub: "sup_aquamotion", domain: "supplier", labels: ["Invoice AM-883", "Invoice AM-871", "Shipment log", "Quality scorecard"] },
  { hub: "sup_mempure", domain: "supplier", labels: ["Invoice MP-412", "Spec sheet V2", "Audit report '25"] },
  { hub: "sup_flowdrive", domain: "supplier", labels: ["Capability matrix", "Sample lot FD-12"] },
  { hub: "sup_aquaclear", domain: "supplier", labels: ["Spec sheet V3", "Pilot quote", "Factory audit"] },
  { hub: "inv_membrane", domain: "inventory", labels: ["Lot MB-204", "Lot MB-209", "Lot MB-213"] },
  { hub: "inv_pump_south", domain: "inventory", labels: ["Bin S-14", "Bin S-15", "Cycle count log"] },
  { hub: "inv_pump_west", domain: "inventory", labels: ["Bin W-02", "Bin W-03"] },
  { hub: "customer", domain: "service", labels: ["Visit history", "App account", "Subscription plan"] },
  { hub: "prod_m2", domain: "product", labels: ["BOM v4.2", "Spec sheet", "Firmware 2.1", "Launch notes"] },
  { hub: "prod_m1", domain: "product", labels: ["BOM v3.0", "Firmware 1.8"] },
  { hub: "prod_m2_pro", domain: "product", labels: ["BOM v1.1", "Spec sheet"] },
  { hub: "batch_0529", domain: "manufacturing", labels: ["Serials 8800–8899", "Line 2 log"] },
  { hub: "batch_0602", domain: "manufacturing", labels: ["Serials 9100–9210", "Line 1 log"] },
  { hub: "tech_slots", domain: "service", labels: ["Tech · R. Kumar", "Tech · S. Iyer", "Tech · A. Khan"] },
  { hub: "warranty_policy", domain: "warranty", labels: ["Terms v3", "Claims SOP"] },
  { hub: "capa_draft", domain: "quality", labels: ["8D template", "Prior CAPA-188"] },
  { hub: "install_backlog", domain: "field", labels: ["Booking queue", "Reschedule log"] },
  { hub: "comp_pump", domain: "component", labels: ["Drawing P-200-C", "Torque spec", "Noise spec"] },
  { hub: "comp_membrane_v2", domain: "component", labels: ["Drawing M-V2", "Flow spec"] },
  { hub: "water_profile", domain: "telemetry", labels: ["TDS map BLR", "Seasonal trend"] },
  { hub: "approval_chain", domain: "action", labels: ["Finance sign-off", "Quality sign-off", "Ops sign-off"] },
  { hub: "complaint_cluster", domain: "quality", labels: ["NPS comments", "App reviews", "Call transcripts"] },
];

// Fan satellites outward from the graph's center so clusters point away from
// the dense middle, with deterministic radius jitter.
const CX = 660;
const CY = 400;

export const SATELLITE_NODES: GraphNodeDef[] = [];
export const SATELLITE_EDGES: GraphEdgeDef[] = [];

SATELLITE_GROUPS.forEach((group, gi) => {
  const hub = NODES.find((n) => n.id === group.hub);
  if (!hub) return;
  const n = group.labels.length;
  const outward = Math.atan2(hub.y - CY, hub.x - CX);
  const spread = Math.PI * 0.9;
  group.labels.forEach((label, i) => {
    const angle = n === 1 ? outward : outward - spread / 2 + (i / (n - 1)) * spread;
    const radius = 78 + ((i * 53 + gi * 17) % 42);
    SATELLITE_NODES.push({
      id: `sat_${gi}_${i}`,
      label,
      domain: group.domain,
      x: Math.round(hub.x + Math.cos(angle) * radius),
      y: Math.round(hub.y + Math.sin(angle) * radius),
    });
    SATELLITE_EDGES.push({ id: `se_${gi}_${i}`, from: `sat_${gi}_${i}`, to: group.hub });
  });
});

// ---------------------------------------------------------------------------
// Workflows
// ---------------------------------------------------------------------------

export const WORKFLOWS: Workflow[] = [
  {
    id: "warranty_triage",
    name: "Warranty triage",
    description: "A customer complaint becomes a prepared, evidence-backed service visit.",
    triggerSource: "New service ticket",
    trigger: "Customer reports low water flow and repeated filter warning after 4 months.",
    retrieval: [
      { nodeId: "ticket_st1048", record: "service_tickets/ST-1048", detail: "Low flow, repeated filter warning · Bengaluru · device is 4 months old" },
      { nodeId: "customer", record: "customers/BLR-20114", detail: "Install address and service history" },
      { nodeId: "serial", record: "devices/NM2-8841", detail: "Native M2 · installed Feb 2026 · built in batch M2-0529" },
      { nodeId: "install_record", record: "installs/7742", detail: "Inlet pressure was normal at install" },
      { nodeId: "telemetry", record: "telemetry/NM2-8841", detail: "90-day series: TDS, flow rate, filter health" },
      { nodeId: "flow_trend", record: "telemetry/flow-rate", detail: "1.8 → 1.1 L/min over the last 12 days (−38%)" },
      { nodeId: "filter_health", record: "telemetry/filter-health", detail: "Declining faster than expected for device age" },
      { nodeId: "water_profile", record: "water_profiles/bengaluru-south", detail: "High-TDS, borewell-fed area" },
      { nodeId: "warranty_policy", record: "policies/native-2yr", detail: "Filters and service visits covered" },
      { nodeId: "similar_tickets", record: "tickets/low-flow-blr-south", detail: "67 similar cases in 30 days · 82% fixed by pre-filter replacement" },
      { nodeId: "batch_0529", record: "batches/M2-0529", detail: "No defect signal; complaints cluster by city, not batch" },
      { nodeId: "inv_prefilter_blr", record: "inventory/prefilter-blr", detail: "214 pre-filter kits available in Bengaluru" },
      { nodeId: "tech_slots", record: "technicians/blr-south", detail: "Next slot tomorrow, 10:00–12:00" },
    ],
    response: {
      headline: "Covered warranty case: most likely a clogged pre-filter, not a defect.",
      narrative:
        "Telemetry shows a gradual 38% drop in flow over 12 days, consistent with pre-filter clogging in a high-TDS area, not a pump failure. 67 similar cases in Bengaluru South were resolved the same way. There is no batch-level defect signal, so this stays a routine service visit.",
      facts: [
        ["Warranty", "Covered (2-year window)"],
        ["Device", "Native M2, 4 months old"],
        ["Likely cause", "Pre-filter clogging from high-TDS water"],
        ["Batch defect risk", "Low"],
        ["Similar cases", "67 in Bengaluru South, 82% fixed by pre-filter swap"],
      ],
      recommendations: [
        {
          action: "Send a technician with a pre-filter kit and an inlet-pressure checklist.",
          why: [
            "Flow declined gradually, which points to clogging rather than pump failure.",
            "82% of the 67 similar local cases were fixed with a pre-filter replacement.",
            "The visit and the part are both covered under warranty.",
          ],
        },
        {
          action: "Watch Bengaluru South for filter anomalies over the next month.",
          why: [
            "67 cases in 30 days is unusually concentrated for one area.",
            "The pattern follows the city's water profile, so more cases are likely.",
          ],
        },
      ],
      artifacts: [
        {
          id: "w1_a1",
          kind: "Checklist",
          title: "Technician visit checklist: ST-1048",
          lines: [
            "Verify inlet pressure at the supply tap",
            "Inspect sediment pre-filter for clogging",
            "Record TDS at inlet and output",
            "Replace pre-filter kit (part PF-R4) if clogged",
            "Re-test flow rate against the 1.6 L/min baseline",
            "Log resolution code in the service app",
          ],
        },
        {
          id: "w1_a2",
          kind: "Email draft",
          title: "Customer note: visit confirmation",
          meta: "To: customer on ticket ST-1048",
          lines: [
            "Hi, thanks for reporting the low flow issue.",
            "Your purifier is fully covered under warranty. Based on its usage data, the most likely cause is a clogged pre-filter, which is common in high-TDS areas like yours.",
            "We've scheduled a technician visit with a replacement kit. There's no charge for the visit or the part.",
          ],
        },
        {
          id: "w1_a3",
          kind: "Task",
          title: "Reserve pre-filter kit",
          meta: "Inventory · Bengaluru warehouse",
          lines: [
            "Reserve 1× pre-filter kit PF-R4 against ticket ST-1048",
            "Attach to technician slot tomorrow, 10:00–12:00",
          ],
        },
      ],
    },
  },
  {
    id: "quality_cluster",
    name: "Quality signal",
    description: "A complaint spike is traced back to one supplier lot before it scales.",
    triggerSource: "System alert",
    trigger: "Pump noise complaints increased 3.2x in the last 14 days.",
    retrieval: [
      { nodeId: "complaint_cluster", record: "alerts/pump-noise", detail: "Complaints up 3.2× vs the previous 14 days" },
      { nodeId: "similar_tickets", record: "service_tickets/pump-noise", detail: "418 affected devices" },
      { nodeId: "tech_notes", record: "technician_notes/pump-noise", detail: "Pump replacement resolved 83% of cases" },
      { nodeId: "serial", record: "devices/affected", detail: "Serial numbers mapped to production batches" },
      { nodeId: "batch_0529", record: "batches/M2-0529", detail: "First affected batch" },
      { nodeId: "batch_0602", record: "batches/M2-0602", detail: "71% of affected devices sit in these two batches" },
      { nodeId: "pump_lot_p88a", record: "component_lots/P-88A", detail: "Both batches used the same pump lot" },
      { nodeId: "sup_aquamotion", record: "suppliers/aquamotion", detail: "Supplier of lot P-88A" },
      { nodeId: "qc_records", record: "qc/M2-0529+M2-0602", detail: "End-of-line pressure test passed · no long-duration fatigue test" },
      { nodeId: "warranty_claims", record: "warranty_claims/pump", detail: "Failures appear 20–35 days after install" },
      { nodeId: "warranty_exposure", record: "warranty/exposure-model", detail: "₹18.4L exposure if the trend continues" },
      { nodeId: "capa_draft", record: "quality/capa-draft", detail: "Corrective action drafted for review" },
    ],
    response: {
      headline: "The complaint spike traces back to one pump lot.",
      narrative:
        "71% of affected devices come from two batches that share pump lot P-88A from AquaMotion. The lot passed the end-of-line pressure test, but failures appear 20–35 days after install, pointing to a fatigue issue the current test doesn't catch. Field data already shows pump replacement fixes it.",
      facts: [
        ["Affected devices", "418"],
        ["Concentration", "71% in batches M2-0529 and M2-0602"],
        ["Shared component", "Pump lot P-88A (AquaMotion)"],
        ["Failure window", "20–35 days after install"],
        ["Field fix", "Pump replacement resolves 83% of cases"],
        ["Exposure", "₹18.4L if the trend continues"],
      ],
      recommendations: [
        {
          action: "Quarantine remaining stock from pump lot P-88A.",
          why: [
            "Both affected batches share this one lot.",
            "Failures show up in the field, not at end-of-line QC, so unshipped stock is suspect.",
            "Remaining inventory still contains the same lot.",
          ],
        },
        {
          action: "Ask AquaMotion for a process deviation report on this lot.",
          why: [
            "The pattern points to a production-run issue, not a design issue.",
            "A documented root cause is needed before accepting future lots.",
          ],
        },
        {
          action: "Add a 30-day fatigue test for the next three pump lots.",
          why: [
            "Failures emerge 20–35 days in, outside the current test window.",
            "No long-duration test exists for this component today.",
          ],
        },
        {
          action: "Stock pump replacement kits in Bengaluru and Hyderabad service vans.",
          why: [
            "The affected batches shipped mostly to these two cities.",
            "Pre-stocking kits turns likely repeat visits into single visits.",
          ],
        },
      ],
      artifacts: [
        {
          id: "w2_a1",
          kind: "Task",
          title: "Quarantine order: pump lot P-88A",
          meta: "Quality + Supply Chain · needs approval",
          lines: [
            "Place a hold on all unconsumed stock from lot P-88A (est. 2,150 units)",
            "Block the lot from production picklists",
            "Tag finished goods containing the lot for inspection",
          ],
        },
        {
          id: "w2_a2",
          kind: "Email draft",
          title: "Process deviation report request",
          meta: "To: AquaMotion Components",
          lines: [
            "We're seeing a field failure pattern concentrated in pump lot P-88A.",
            "Symptoms: abnormal noise 20–35 days after installation. End-of-line tests passed at our factory.",
            "Please share the process deviation report for this lot, including any changes to winding, bearing, or assembly steps.",
          ],
        },
        {
          id: "w2_a3",
          kind: "Memo",
          title: "CAPA draft: abnormal pump noise, lot P-88A",
          meta: "For: Quality team review",
          lines: [
            "Problem: pump noise complaints up 3.2× in 14 days; 418 devices affected.",
            "Hypothesis: latent fatigue defect in pump lot P-88A.",
            "Containment: lot quarantine, plus replacement kits in affected cities.",
            "Corrective: supplier deviation report; 30-day fatigue test for the next three lots.",
          ],
        },
      ],
    },
  },
  {
    id: "supplier_delay",
    name: "Supplier delay",
    description: "A delay email becomes a clear picture of what's affected and what to do.",
    triggerSource: "Supplier email",
    trigger:
      "Shipment of 12,000 pump assemblies will be delayed by 10 days due to capacity constraints.",
    retrieval: [
      { nodeId: "supplier_email", record: "emails/aquamotion-delay", detail: "12,000 pump assemblies delayed 10 days" },
      { nodeId: "sup_aquamotion", record: "suppliers/aquamotion", detail: "Two late shipments in the last quarter" },
      { nodeId: "po_4472", record: "purchase_orders/PO-4472", detail: "The delayed order, due this month" },
      { nodeId: "comp_pump", record: "components/pump-p200", detail: "Used in both Native M1 and M2" },
      { nodeId: "prod_m1", record: "products/native-m1", detail: "Affected SKU" },
      { nodeId: "prod_m2", record: "products/native-m2", detail: "Affected SKU with higher volume" },
      { nodeId: "inv_pump_south", record: "inventory/pumps-south", detail: "South warehouse: 4.2 days of cover" },
      { nodeId: "inv_pump_west", record: "inventory/pumps-west", detail: "West warehouse holds surplus · 8.5 days cover overall" },
      { nodeId: "city_demand", record: "demand/city-forecast", detail: "Bengaluru, Delhi NCR, Hyderabad carry the highest load" },
      { nodeId: "install_backlog", record: "field/install-backlog", detail: "1,840 bookings fall inside the delay window" },
      { nodeId: "sup_flowdrive", record: "suppliers/flowdrive", detail: "Backup pump supplier, approved for M1 only" },
    ],
    response: {
      headline: "Stock covers 8.5 of the 10 delay days. The gap is closable.",
      narrative:
        "The delay hits both M1 and M2, with 1,840 installation bookings inside the window, concentrated in Bengaluru, Delhi NCR, and Hyderabad. Moving 3,000 units from the West warehouse and shifting M1 volume to the approved backup supplier closes most of the gap without touching customer commitments.",
      facts: [
        ["Delayed order", "PO-4472 · 12,000 units · 10 days"],
        ["SKUs affected", "Native M1 and M2"],
        ["Stock cover", "8.5 days at the current run-rate"],
        ["Bookings at risk", "1,840 across three cities"],
        ["Backup supplier", "FlowDrive (M1 only)"],
        ["Supplier history", "2 late shipments last quarter"],
      ],
      recommendations: [
        {
          action: "Move 3,000 pump units from the West warehouse to the South warehouse.",
          why: [
            "South region carries the highest at-risk installation load.",
            "West holds surplus relative to its near-term demand.",
            "Overall cover is 8.5 days against a 10-day delay.",
          ],
        },
        {
          action: "Prioritise M2 production for the three high-demand cities.",
          why: [
            "M2 carries most of the upcoming bookings.",
            "These cities account for the bulk of the 1,840 at-risk installs.",
          ],
        },
        {
          action: "Shift M1 pump volume to FlowDrive.",
          why: [
            "FlowDrive is already approved for M1 (not yet for M2).",
            "Moving M1 volume frees the delayed AquaMotion units for M2.",
          ],
        },
        {
          action: "Ask AquaMotion for a delivery recovery plan.",
          why: [
            "This is their third late shipment in two quarters.",
            "City ops needs a firm date to re-plan bookings.",
          ],
        },
      ],
      artifacts: [
        {
          id: "w3_a1",
          kind: "Task",
          title: "Transfer order: 3,000 pump assemblies, West → South",
          meta: "Supply Chain · needs approval",
          lines: [
            "Transfer 3,000× Pump P-200 from West warehouse to South warehouse",
            "Priority freight · target arrival within 3 days",
            "Update allocation so South bookings draw on transferred stock first",
          ],
        },
        {
          id: "w3_a2",
          kind: "Email draft",
          title: "Delivery recovery plan request",
          meta: "To: AquaMotion Components",
          lines: [
            "We've received your note on the 10-day delay to PO-4472.",
            "This affects committed installations in three cities, so we need a firm recovery date and a partial-shipment option; anything you can release early helps.",
            "Please also confirm whether the constraint affects the following month's order.",
          ],
        },
        {
          id: "w3_a3",
          kind: "Memo",
          title: "City ops update: pump supply, next 10 days",
          meta: "To: Bengaluru, Delhi NCR, Hyderabad ops leads",
          lines: [
            "Pump deliveries are delayed 10 days; current stock covers about 8.5.",
            "Protect existing installation bookings first; push new bookings out 3–4 days.",
            "M1 installs are unaffected once FlowDrive volume starts (est. day 4).",
          ],
        },
      ],
    },
  },
  {
    id: "component_change",
    name: "Component change",
    description: "A proposed supplier switch is mapped across everything it touches.",
    triggerSource: "Proposed change",
    trigger: "Switch RO membrane supplier from MemPure V2 to AquaClear V3 for Native M2 Pro.",
    retrieval: [
      { nodeId: "change_request", record: "change_requests/ECO-214", detail: "Membrane supplier switch proposed for M2 Pro" },
      { nodeId: "comp_membrane_v2", record: "components/mempure-v2", detail: "Current membrane · primary filtration assembly" },
      { nodeId: "prod_m2_pro", record: "products/native-m2-pro", detail: "Only affected SKU · 2 BOM lines" },
      { nodeId: "sup_mempure", record: "suppliers/mempure", detail: "Current supplier · reliable history" },
      { nodeId: "comp_membrane_v3", record: "components/aquaclear-v3", detail: "Candidate part · no validation history with Native" },
      { nodeId: "sup_aquaclear", record: "suppliers/aquaclear", detail: "Proposed supplier · quality score 86" },
      { nodeId: "po_membrane", record: "purchase_orders/membranes", detail: "4 open POs would need renegotiation" },
      { nodeId: "inv_membrane", record: "inventory/membranes", detail: "8,700 units of the current membrane in stock" },
      { nodeId: "validation", record: "quality/validation-protocol", detail: "Required: TDS rejection, flow rate, pressure stability, lifecycle" },
      { nodeId: "warranty_claims", record: "warranty_claims/membrane", detail: "Membrane issues are 18% of filtration complaints" },
      { nodeId: "tech_manual", record: "service/technician-manual", detail: "Troubleshooting guide references current membrane behaviour" },
      { nodeId: "packaging", record: "products/packaging-claims", detail: "Purification claims must be re-verified" },
      { nodeId: "approval_chain", record: "approvals/eco-214", detail: "Product → Quality → Supply Chain → Service Ops → Finance" },
    ],
    response: {
      headline: "The switch touches far more than the BOM.",
      narrative:
        "Changing the membrane strands 8,700 units of current inventory and 4 open POs, requires a full validation suite before approval, and forces updates to the technician guide and packaging claims. Customers see no change if performance validates, but the change is high-risk if flow-rate variance exceeds the current spec.",
      facts: [
        ["SKU affected", "Native M2 Pro only"],
        ["BOM lines", "2"],
        ["Open POs", "4 to renegotiate or wind down"],
        ["Inventory", "8,700 units to disposition"],
        ["Validation needed", "TDS rejection · flow · pressure · lifecycle"],
        ["Customer impact", "None, if performance validates"],
      ],
      recommendations: [
        {
          action: "Run the full validation suite before anything else moves.",
          why: [
            "AquaClear V3 has no validation history with Native.",
            "Membrane issues already account for 18% of filtration complaints.",
            "The change is high-risk if flow-rate variance exceeds the current spec.",
          ],
        },
        {
          action: "Plan disposition for the 8,700 units of current membrane stock.",
          why: [
            "An abrupt switch strands the inventory.",
            "Four open POs need renegotiation or wind-down terms.",
          ],
        },
        {
          action: "Update the technician guide before the first new unit ships.",
          why: [
            "The current guide describes MemPure-specific behaviour.",
            "Unprepared technicians drive misdiagnosis and repeat visits.",
          ],
        },
        {
          action: "Route the approval packet across all five functions.",
          why: [
            "The change touches product, quality, supply chain, service, and packaging.",
            "Finance has to absorb disposition and validation cost.",
          ],
        },
      ],
      artifacts: [
        {
          id: "w4_a1",
          kind: "Checklist",
          title: "Validation protocol: AquaClear V3",
          lines: [
            "TDS rejection rate vs spec (≥ 96%)",
            "Flow rate at three pressure points",
            "Pressure stability over a 48-hour cycle",
            "Accelerated lifecycle test (6-month equivalent)",
            "Side-by-side comparison against MemPure V2 baseline",
          ],
        },
        {
          id: "w4_a2",
          kind: "Email draft",
          title: "Pre-validation questions",
          meta: "To: AquaClear Systems",
          lines: [
            "Before we begin validation, we need three things:",
            "Flow-rate variance data across recent production lots.",
            "Chlorine tolerance and recommended pre-treatment.",
            "The change history for the V3 spec over the last 12 months.",
          ],
        },
        {
          id: "w4_a3",
          kind: "Memo",
          title: "Approval packet: ECO-214 summary",
          meta: "Sign-off: Product → Quality → Supply Chain → Service Ops → Finance",
          lines: [
            "Change: RO membrane supplier switch on Native M2 Pro.",
            "Inventory: 8,700 units to disposition; 4 open POs affected.",
            "Gate: full validation must pass before any PO is placed with AquaClear.",
            "Service: technician guide and packaging claims update before first shipment.",
          ],
        },
      ],
    },
  },
];

export const COPY = {
  product: "Sutra",
  title: "Native context layer",
  intro:
    "One core system that integrates products, suppliers, batches, tickets, telemetry, and warranty data into a single graph. Pick a workflow to see an agent read from the graph and prepare a response.",
};
