/**
 * THE MANDATE
 * -----------
 * This file is the brain of the whole system. The scraping is commodity; this
 * is what makes the tool *yours*. It encodes what Blockmate actually backs so
 * the qualifier can score every project against it.
 *
 * Edit this file as the strategy sharpens. Everything downstream reads from it:
 * the LLM qualification prompt, the fit-score weighting, and the email tone.
 *
 * Keep it honest. A loose mandate produces a dashboard full of noise; a tight
 * one is the difference between 5 real leads a week and 200 junk rows.
 */

export const MANDATE = {
  firmName: "Blockmate Infrastructure",

  // One-paragraph self-description fed to the LLM so its judgment is grounded
  // in who we are, not a generic "infra investor".
  thesis: `Blockmate Infrastructure is a pre-FID infrastructure development capital
platform. We provide bridge / predevelopment equity in the structural gap between
venture capital and institutional infrastructure funds — roughly USD 1–50M of
predevelopment equity — to take hard-asset energy projects from site control
through interconnection, feasibility, permitting and financial close. We back
proven technology and hard assets, not financial engineering. Our ideal
counterparty is a developer or sponsor with a real project that has cleared early
milestones (e.g. site control, connection enquiry) but is not yet capitalized for
the predevelopment phase and is not already funded by a major utility or
infrastructure fund.`,

  // --- Hard filters (a project failing these is dropped before LLM scoring) ---
  hardFilters: {
    technologies: [
      "SOLAR",
      "WIND",
      "BATTERY",
      "SOLAR_BATTERY",
      "PUMPED_HYDRO",
      "HYBRID",
      "GREEN_HYDROGEN",
    ],
    // Stages worth our time. OPERATING / WITHDRAWN are dropped.
    stages: ["ENQUIRY", "PROPOSED", "COMMITTED"],
    // Below this, the predevelopment cheque doesn't make sense.
    minCapacityMw: 20,
  },

  // --- Soft scoring guidance (the LLM weighs these to produce sub-scores) ---
  // Each dimension is scored 0-100; the weights blend them into fitScore.
  scoring: {
    weights: {
      stageFit: 0.3, // earlier & pre-FID scores higher
      scaleFit: 0.2, // capex roughly in/above our range
      techFit: 0.2, // closeness to what we've actually executed
      capitalNeedFit: 0.3, // does this party plausibly need us
    },

    // Plain-language rubric handed to the LLM for each dimension.
    rubric: {
      stageFit: `Highest for connection ENQUIRY or freshly PROPOSED projects that
are clearly pre-FID. Lower for COMMITTED (FID likely reached, our entry point may
have passed). Zero for OPERATING.`,

      scaleFit: `Estimate predevelopment capital need from capacity and technology
(rough rule of thumb: utility-scale solar ~AUD 1.2-1.6M/MW total capex, of which
the predevelopment slice we'd bridge is a small fraction). Highest when the
predevelopment need plausibly lands in our USD 1–50M band. Penalize projects so
small the cheque is uneconomic, or so massive they're already institutional.`,

      techFit: `Highest for solar, battery, and solar+battery hybrids — our
demonstrated execution area. Solid for wind and pumped hydro. Lower for earlier-TRL
plays like green hydrogen unless paired with proven generation.`,

      capitalNeedFit: `THE KEY JUDGMENT. Highest for independent / mid-tier
developers and first-time sponsors who have a real project but no obvious balance
sheet or fund behind them. LOWEST for projects whose proponent is a major utility,
a tier-1 developer (e.g. the global majors), or already clearly capitalized — they
don't need predevelopment bridge capital and contacting them wastes credibility.
Use the proponent's track record (their other projects in our data) and entity
profile to judge this.`,
    },
  },

  // Leads scoring below this are stored but hidden from the default dashboard view.
  surfaceThreshold: 55,
} as const;

export type Mandate = typeof MANDATE;
