import type { Metadata } from "next";
import ReportView from "@/components/ReportView";

export const metadata: Metadata = {
  title: "Change impact report — CodeMind",
  description: "A shareable CodeMind blast-radius report built from a Graphify knowledge graph.",
};

export default function ReportPage() {
  return <ReportView />;
}
