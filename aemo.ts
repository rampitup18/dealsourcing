/**
 * AEMO Generation Information ingestion — the PRIMARY fresh signal.
 *
 * AEMO publishes a "Generation Information" workbook (.xlsx) roughly monthly at:
 *   https://www.aemo.com.au/energy-systems/electricity/national-electricity-market-nem/
 *     nem-forecasting-and-planning/forecasting-and-planning-data/generation-information
 *
 * It is published "as is" for exactly our use case — the rule change (NER 3.7F)
 * that created this page was explicitly to help developers who sell grid-scale
 * assets pre-connection assess viability. Every connection enquiry >=5MW flows in.
 *
 * IMPORTANT — why this is configurable:
 * The file URL changes every release and the workbook layout (sheet name, header
 * row, column labels) shifts between versions. We do NOT hardcode a URL. Set the
 * current file URL in .env (AEMO_GENINFO_URL) each month, or drop the file at
 * ./data/aemo.xlsx. The column mapping below is defensive: it locates columns by
 * fuzzy header match rather than fixed index, so minor layout changes don't break it.
 *
 * If you'd rather not babysit the URL, the file is also linked from AEMO's
 * "AEMO publishes latest NEM generation data" news posts.
 */

import * as XLSX from "xlsx";
import { readFileSync, existsSync } from "fs";
import {
  NormalizedProject,
  classifyTechnology,
  classifyStage,
  regionFromState,
} from "./normalize";

// Candidate header labels we search for (lowercased, fuzzy "includes" match).
const COL = {
  project: ["project", "site name", "station name", "generator"],
  proponent: ["developer", "proponent", "owner", "participant", "company"],
  tech: ["fuel", "technology", "fuel type", "fuel/technology"],
  capacity: ["capacity", "nameplate", "mw", "registered capacity", "upper capacity"],
  status: ["status", "project status", "development", "classification"],
  state: ["region", "state", "nem region"],
};

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map((h) => String(h ?? "").toLowerCase().trim());
  for (const cand of candidates) {
    const i = lower.findIndex((h) => h.includes(cand));
    if (i >= 0) return i;
  }
  return -1;
}

async function loadWorkbook(): Promise<XLSX.WorkBook> {
  const localPath = process.env.AEMO_LOCAL_PATH ?? "./data/aemo.xlsx";
  if (existsSync(localPath)) {
    console.log(`[aemo] reading local file ${localPath}`);
    return XLSX.read(readFileSync(localPath));
  }
  const url = process.env.AEMO_GENINFO_URL;
  if (!url) {
    throw new Error(
      "[aemo] No AEMO source. Set AEMO_GENINFO_URL to the current workbook URL, " +
        "or place the file at ./data/aemo.xlsx. (The URL changes each monthly release.)",
    );
  }
  console.log(`[aemo] downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`[aemo] download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return XLSX.read(buf);
}

/** Pick the sheet most likely to hold the project list. */
function pickSheet(wb: XLSX.WorkBook): string {
  const preferred = wb.SheetNames.find((n) =>
    /existing|new dev|generation|summary|projects/i.test(n),
  );
  return preferred ?? wb.SheetNames[0];
}

export async function ingestAemo(): Promise<NormalizedProject[]> {
  const wb = await loadWorkbook();
  const sheetName = pickSheet(wb);
  const sheet = wb.Sheets[sheetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  // Find the header row: the first row where >=3 of our target columns resolve.
  let headerIdx = -1;
  let cols: Record<keyof typeof COL, number> | null = null;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const headers = (rows[i] as unknown[]).map((c) => String(c ?? ""));
    const candidate = {
      project: findCol(headers, COL.project),
      proponent: findCol(headers, COL.proponent),
      tech: findCol(headers, COL.tech),
      capacity: findCol(headers, COL.capacity),
      status: findCol(headers, COL.status),
      state: findCol(headers, COL.state),
    };
    const resolved = Object.values(candidate).filter((v) => v >= 0).length;
    if (resolved >= 3 && candidate.project >= 0) {
      headerIdx = i;
      cols = candidate;
      break;
    }
  }

  if (!cols || headerIdx < 0) {
    throw new Error(
      `[aemo] Could not locate a header row in sheet "${sheetName}". ` +
        `Inspect the workbook and adjust the COL candidates in ingest/aemo.ts.`,
    );
  }
  console.log(`[aemo] sheet="${sheetName}" headerRow=${headerIdx} cols=`, cols);

  const out: NormalizedProject[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    const get = (idx: number) => (idx >= 0 ? String(r[idx] ?? "").trim() : "");

    const name = get(cols.project);
    if (!name) continue;

    const techText = get(cols.tech);
    const statusText = get(cols.status);
    const state = get(cols.state) || null;
    const capRaw = get(cols.capacity).replace(/[^0-9.]/g, "");
    const capacityMw = capRaw ? Number(capRaw) : null;

    out.push({
      name,
      proponentRaw: get(cols.proponent) || "Unknown developer",
      technology: classifyTechnology(techText || name),
      capacityMw: Number.isFinite(capacityMw as number) ? capacityMw : null,
      region: regionFromState(state),
      state,
      stage: classifyStage(statusText),
      latitude: null,
      longitude: null,
      source: "AEMO",
      sourceRef: null,
      sourceUrl:
        "https://www.aemo.com.au/energy-systems/electricity/national-electricity-market-nem/nem-forecasting-and-planning/forecasting-and-planning-data/generation-information",
      raw: Object.fromEntries(
        Object.entries(cols).map(([k, idx]) => [k, get(idx as number)]),
      ),
    });
  }

  console.log(`[aemo] parsed ${out.length} project rows`);
  return out;
}
