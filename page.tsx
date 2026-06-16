import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getTrackRecord } from "@/ingest/track-record";
import { fitBand, TECH_LABEL, STAGE_LABEL } from "@/lib/ui";
import EmailPanel from "./EmailPanel";

export const dynamic = "force-dynamic";

const FIT_ROWS = [
  { key: "stageFit", label: "Stage fit" },
  { key: "scaleFit", label: "Scale fit" },
  { key: "techFit", label: "Technology fit" },
  { key: "capitalNeedFit", label: "Capital need" },
] as const;

export default async function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({
    where: { id },
    include: {
      project: { include: { proponent: true, sources: true } },
      // sources included via project
    },
  });
  if (!lead) notFound();

  const p = lead.project;
  const prop = p.proponent;
  const tr = await getTrackRecord(prop.id);
  const otherProjects = tr.projects.filter((x) => x.id !== p.id);
  const band = fitBand(lead.fitScore);
  const directors = (prop.directors as { name: string; role: string }[] | null) ?? [];

  return (
    <>
      <Link href="/" className="back">
        ← all leads
      </Link>

      <div className="detail-head">
        <div>
          <h1>{p.name}</h1>
          <div className="dev">{prop.rawNames[0] ?? prop.name}</div>
          <div className="tags">
            <span className="chip tech">{TECH_LABEL[p.technology] ?? p.technology}</span>
            <span className={`chip stage-${p.stage}`}>
              {STAGE_LABEL[p.stage] ?? p.stage}
            </span>
            {p.capacityMw && <span className="chip">{p.capacityMw} MW</span>}
            <span className="chip">{p.region ?? p.state ?? "AU"}</span>
          </div>
        </div>
        <div className={`fit fit-${band}`} style={{ flexShrink: 0 }}>
          <span className="score" style={{ fontSize: 28, width: "auto" }}>
            {lead.fitScore}
          </span>
        </div>
      </div>

      <div className="grid">
        {/* LEFT COLUMN */}
        <div>
          {/* Why it scored */}
          <div className="card">
            <h3>Qualification</h3>
            <div className="body">
              <div className={`fitscore-big fit-${band}`}>
                <span className="n">{lead.fitScore}</span>
                <span className="of">/ 100 mandate fit</span>
              </div>
              {FIT_ROWS.map((r) => (
                <div className="fitrow" key={r.key}>
                  <span className="lbl">{r.label}</span>
                  <span className="track">
                    <i style={{ width: `${lead[r.key]}%` }} />
                  </span>
                  <span className="v">{lead[r.key]}</span>
                </div>
              ))}
              <p className="rationale" style={{ marginTop: 18 }}>
                {lead.rationale}
              </p>
              {lead.flags.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  {lead.flags.map((f) => (
                    <span className="chip flag" key={f}>
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Deal facts */}
          <div className="card">
            <h3>Deal data</h3>
            <div className="body">
              <div className="dl">
                <div>
                  <div className="k">Technology</div>
                  <div className="val">{TECH_LABEL[p.technology] ?? p.technology}</div>
                </div>
                <div>
                  <div className="k">Capacity</div>
                  <div className="val">{p.capacityMw ? `${p.capacityMw} MW` : "—"}</div>
                </div>
                <div>
                  <div className="k">Stage</div>
                  <div className="val">{STAGE_LABEL[p.stage] ?? p.stage}</div>
                </div>
                <div>
                  <div className="k">NEM region</div>
                  <div className="val">{p.region ?? "—"}</div>
                </div>
                <div>
                  <div className="k">Coordinates</div>
                  <div className="val">
                    {p.latitude != null
                      ? `${p.latitude.toFixed(3)}, ${p.longitude?.toFixed(3)}`
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="k">To transmission</div>
                  <div className="val">
                    {p.kmToTransmission != null ? `${p.kmToTransmission.toFixed(0)} km` : "—"}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {p.sources.map((s) => (
                  <a
                    key={s.id}
                    href={s.sourceUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chip"
                  >
                    {s.source}
                    {s.sourceRef ? ` · ${s.sourceRef}` : ""} ↗
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Track record — previous deals by this party */}
          <div className="card">
            <h3>Developer track record</h3>
            <div className="body">
              <div className="dl" style={{ marginBottom: otherProjects.length ? 18 : 0 }}>
                <div>
                  <div className="k">Projects on record</div>
                  <div className="val">{tr.totalProjects}</div>
                </div>
                <div>
                  <div className="k">Operating</div>
                  <div className="val">{tr.operating}</div>
                </div>
                <div>
                  <div className="k">In pipeline</div>
                  <div className="val">{tr.inPipeline}</div>
                </div>
                <div>
                  <div className="k">Total capacity</div>
                  <div className="val">~{Math.round(tr.totalCapacityMw)} MW</div>
                </div>
              </div>
              {otherProjects.length > 0 ? (
                otherProjects.map((x) => (
                  <div className="tr-item" key={x.id}>
                    <span className="tname">{x.name}</span>
                    <span className="tmeta">
                      {TECH_LABEL[x.technology]} · {x.capacityMw ?? "—"} MW ·{" "}
                      {STAGE_LABEL[x.stage]}
                    </span>
                  </div>
                ))
              ) : (
                <p className="empty">
                  No other projects on record. Consistent with a first-time / single-asset
                  sponsor.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div>
          {/* Cold email */}
          <div className="card">
            <h3>Outreach draft</h3>
            <EmailPanel
              leadId={lead.id}
              initialSubject={lead.emailSubject}
              initialBody={lead.emailBody}
            />
          </div>

          {/* Entity / contacts */}
          <div className="card">
            <h3>Party &amp; contacts</h3>
            <div className="body">
              <div className="dl" style={{ marginBottom: 16 }}>
                <div>
                  <div className="k">Entity</div>
                  <div className="val" style={{ fontSize: 12 }}>
                    {prop.entityType ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="k">ABN</div>
                  <div className="val">{prop.abn ?? "—"}</div>
                </div>
                <div>
                  <div className="k">Status</div>
                  <div className="val" style={{ fontSize: 12 }}>
                    {prop.entityStatus ?? "—"}
                  </div>
                </div>
                <div>
                  <div className="k">Registered</div>
                  <div className="val">{prop.registeredAt ?? "—"}</div>
                </div>
              </div>

              {directors.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div className="k" style={{ marginBottom: 8 }}>
                    Directors (ASIC)
                  </div>
                  {directors.map((d) => (
                    <div className="tr-item" key={d.name}>
                      <span className="tname">{d.name}</span>
                      <span className="tmeta">{d.role}</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                {prop.website && (
                  <a className="chip" href={prop.website} target="_blank" rel="noopener noreferrer">
                    website ↗
                  </a>
                )}
                {prop.linkedinUrl && (
                  <a
                    className="chip"
                    href={prop.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    linkedin ↗
                  </a>
                )}
              </div>

              <div className="contacts-note">
                Direct contact emails aren&apos;t in public records. Wire a contact-enrichment
                API (Apollo / Hunter / RocketReach) keyed on the company domain to populate
                named contacts here. Until then, use the entity, directors and LinkedIn above
                to find the right person.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
