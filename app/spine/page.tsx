import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SimulationPanel } from "@/components/SimulationPanel";

// Dev-only simulation controls. 404s entirely unless the spine is enabled,
// so production (DATA_MODE unset) never exposes this page.
export default async function SpinePage() {
  if (process.env.DATA_MODE !== "graph") notFound();
  await connection();
  return <SimulationPanel />;
}
