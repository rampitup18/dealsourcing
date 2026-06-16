/**
 * Qualification — the LLM step that turns projects into scored leads.
 *
 * For each project that clears the hard filters, we hand the model:
 *   - the Blockmate mandate (from lib/mandate.ts)
 *   - the project facts
 *   - the proponent's derived track record
 * ...and ask for four 0-100 sub-scores plus a rationale and flags. We compute
 * the blended fitScore ourselves from the mandate weights (so the weighting is
 * auditable and not at the model's discretion).
 */

import { prisma } from "../lib/db";
import { completeJson } from "../lib/anthropic";
import { MANDATE } from "../lib/mandate";
import { getTrackRecord, summarizeTrackRecord } from "./track-record";

interface QualOutput {
  stageFit: number;
  scaleFit: number;
  techFit: number;
  capitalNeedFit: number;
  rationale: string;
  flags: string[];
}

function passesHardFilters(p: {
  technology: string;
  stage: string;
  capacityMw: number | null;
}): boolean {
  const f = MANDATE.hardFilters;
  if (!f.technologies.includes(p.technology)) return false;
  if (!f.stages.includes(p.stage)) return false;
  if (p.capacityMw != null && p.capacityMw < f.minCapacityMw) return false;
  return true;
}

const SYSTEM = `You are the deal-screening engine for ${MANDATE.firmName}.
Score one project against the firm's mandate. Be skeptical and specific — a
dashboard full of false positives is worse than a short, sharp list.

FIRM MANDATE:
${MANDATE.thesis}

SCORING DIMENSIONS (each 0-100):
- stageFit: ${MANDATE.scoring.rubric.stageFit}
- scaleFit: ${MANDATE.scoring.rubric.scaleFit}
- techFit: ${MANDATE.scoring.rubric.techFit}
- capitalNeedFit: ${MANDATE.scoring.rubric.capitalNeedFit}

Return ONLY a JSON object, no prose, no code fences:
{
  "stageFit": <int>,
  "scaleFit": <int>,
  "techFit": <int>,
  "capitalNeedFit": <int>,
  "rationale": "<= 80 words explaining the scores, naming the deciding factor",
  "flags": ["short flags like 'major utility', 'already capitalized', 'capacity unknown'"]
}`;

function blend(o: QualOutput): number {
  const w = MANDATE.scoring.weights;
  return Math.round(
    o.stageFit * w.stageFit +
      o.scaleFit * w.scaleFit +
      o.techFit * w.techFit +
      o.capitalNeedFit * w.capitalNeedFit,
  );
}

/** Qualify all projects that don't yet have a lead. Returns count of new leads. */
export async function qualifyNewProjects(): Promise<number> {
  const projects = await prisma.project.findMany({
    where: { lead: null },
    include: { proponent: true },
  });

  let leadsCreated = 0;

  for (const p of projects) {
    if (!passesHardFilters(p)) continue;

    const tr = await getTrackRecord(p.proponentId);

    const user = `PROJECT:
- Name: ${p.name}
- Technology: ${p.technology}
- Capacity: ${p.capacityMw ?? "unknown"} MW
- Stage: ${p.stage}
- Region/State: ${p.region ?? p.state ?? "unknown"}
- Location known: ${p.latitude != null ? "yes" : "no"}${p.kmToTransmission != null ? `\n- ~${p.kmToTransmission.toFixed(0)} km to transmission` : ""}

PROPONENT: ${p.proponent.rawNames[0] ?? p.proponent.name}
- Entity: ${p.proponent.entityType ?? "unknown"}, ABN ${p.proponent.abn ?? "n/a"}
- Track record: ${summarizeTrackRecord(tr)}`;

    let out: QualOutput;
    try {
      out = await completeJson<QualOutput>({ system: SYSTEM, user, maxTokens: 700 });
    } catch (err) {
      console.error(`[qualify] failed for "${p.name}":`, String(err));
      continue;
    }

    const fitScore = blend(out);

    await prisma.lead.create({
      data: {
        projectId: p.id,
        fitScore,
        stageFit: out.stageFit,
        scaleFit: out.scaleFit,
        techFit: out.techFit,
        capitalNeedFit: out.capitalNeedFit,
        rationale: out.rationale,
        flags: out.flags ?? [],
      },
    });
    leadsCreated++;
    console.log(`[qualify] ${p.name} → fit ${fitScore}`);
  }

  return leadsCreated;
}
