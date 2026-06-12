import { connection } from "next/server";
import HomeClient from "@/components/HomeClient";
import { getWorkflows } from "@/lib/data-source";

// With DATA_MODE unset (production), this prerenders statically with the
// scripted demo data — byte-identical behavior to main. In graph mode the
// page opts into dynamic rendering so each load reflects the live graph.
export default async function Page() {
  if (process.env.DATA_MODE === "graph") await connection();
  const { workflows, live } = await getWorkflows();
  return <HomeClient workflows={workflows} liveData={live} />;
}
