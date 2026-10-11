/**
 * Deterministic geography: whether a company's recorded country (and, where
 * needed, city or locations) falls inside a campaign's geography — decided
 * from data, without a model, whenever the data allows it. Shared by research
 * and scoring so both apply exactly the same gate.
 */

const squash = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Country names as they appear in data, in the languages of the markets. */
const COUNTRY_ALIASES: Record<string, string> = {
  luxembourg: "LU", luxemburg: "LU", letzebuerg: "LU", lu: "LU", "grand duche de luxembourg": "LU",
  belgium: "BE", belgique: "BE", belgie: "BE", belgien: "BE", be: "BE",
  france: "FR", frankreich: "FR", frankrijk: "FR", fr: "FR",
  germany: "DE", allemagne: "DE", deutschland: "DE", duitsland: "DE", de: "DE",
  netherlands: "NL", "pays bas": "NL", nederland: "NL", niederlande: "NL", nl: "NL",
  switzerland: "CH", suisse: "CH", schweiz: "CH", zwitserland: "CH", ch: "CH",
};

/** Sub-national regions, mapped to their country. */
const REGIONS: Record<string, string> = {
  // France (current regions and the former ones still used in business)
  "grand est": "FR", alsace: "FR", lorraine: "FR", "champagne ardenne": "FR",
  "hauts de france": "FR", "nord pas de calais": "FR", picardie: "FR",
  "ile de france": "FR", normandie: "FR", bretagne: "FR", "pays de la loire": "FR",
  "centre val de loire": "FR", "bourgogne franche comte": "FR", "nouvelle aquitaine": "FR",
  occitanie: "FR", "auvergne rhone alpes": "FR", "provence alpes cote d azur": "FR", corse: "FR",
  // Belgium
  wallonia: "BE", wallonie: "BE", flanders: "BE", flandre: "BE", vlaanderen: "BE",
  brussels: "BE", bruxelles: "BE", brussel: "BE",
  // Germany
  saarland: "DE", "rheinland pfalz": "DE", "rhineland palatinate": "DE", "baden wurttemberg": "DE",
  bayern: "DE", bavaria: "DE", hessen: "DE", "nordrhein westfalen": "DE", "north rhine westphalia": "DE",
  niedersachsen: "DE", berlin: "DE", hamburg: "DE", bremen: "DE", sachsen: "DE", thuringen: "DE",
  brandenburg: "DE", "sachsen anhalt": "DE", "mecklenburg vorpommern": "DE", "schleswig holstein": "DE",
  // Netherlands
  limburg: "NL", "noord brabant": "NL", zeeland: "NL",
};

export type GeographyCheck = { assessment: "MET" | "NOT_MET"; rationale: string } | null;

/**
 * Settles the geography criterion without a model whenever country data can:
 * - the prospect's country is a whole target country → MET;
 * - the prospect's country is not in the target geography at all → NOT_MET;
 * - the target only names regions of that country → not decidable here (null),
 *   unless the recorded city or locations name the region itself.
 */
export function checkGeography(
  geography: string[],
  prospect: { country: string | null; city: string | null; locations: string[] },
): GeographyCheck {
  if (!prospect.country?.trim()) return null;

  const targets = geography.map((entry) => {
    const key = squash(entry);
    if (COUNTRY_ALIASES[key]) return { country: COUNTRY_ALIASES[key], region: null as string | null, label: entry };
    if (REGIONS[key]) return { country: REGIONS[key], region: key, label: entry };
    return { country: null, region: null, label: entry };
  });
  // A target that is neither a known country nor a known region: do not guess.
  if (targets.some((target) => !target.country)) return null;

  // Every target is understood, so a country that is none of their countries
  // is outside the geography, even when it is not in the alias table.
  const country = COUNTRY_ALIASES[squash(prospect.country)] ?? `other:${squash(prospect.country)}`;

  if (targets.some((target) => target.country === country && !target.region)) {
    return { assessment: "MET", rationale: `${prospect.country} est un pays cible.` };
  }
  const sameCountryRegions = targets.filter((target) => target.country === country && target.region);
  if (!sameCountryRegions.length) {
    return {
      assessment: "NOT_MET",
      rationale: `${prospect.country} est hors de la zone cible (${geography.join(", ")}).`,
    };
  }
  const places = [prospect.city, ...prospect.locations].filter(Boolean).map((place) => squash(place!));
  const region = sameCountryRegions.find((target) => places.includes(target.region!));
  return region ? { assessment: "MET", rationale: `Situé en ${region.label}.` } : null;
}

/** The rubric criterion geography is scored under (see scoringRubric). */
export const GEOGRAPHY_PREFIX = "Operates in the target geography";

/**
 * Replaces whatever a model said about geography with the verdict the data
 * settles, when it settles one. Other factors pass through untouched.
 */
export function applyGeographyCheck(
  rawFactors: unknown,
  rubric: { criterion: string; maxPoints: number }[],
  check: GeographyCheck,
): Record<string, unknown>[] {
  const factors = Array.isArray(rawFactors) ? (rawFactors as Record<string, unknown>[]) : [];
  const criterion = rubric.find((entry) => entry.criterion.startsWith(GEOGRAPHY_PREFIX));
  if (!check || !criterion) return factors;
  return [
    ...factors.filter((factor) => !String(factor.rubricCriterion ?? "").startsWith(GEOGRAPHY_PREFIX)),
    {
      label: "Zone géographique cible",
      rubricCriterion: criterion.criterion,
      assessment: check.assessment,
      points: check.assessment === "MET" ? criterion.maxPoints : 0,
      basis: "PROSPECT_FIELD",
      evidenceRefs: [],
      supportingFields: ["country"],
      rationale: `${check.rationale} (décidé à partir des données enregistrées, pas par le modèle)`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* Search areas                                                               */
/* -------------------------------------------------------------------------- */

export type SearchArea = {
  /** The name used in queries, as local businesses write it. */
  name: string;
  /** DataForSEO country name. */
  country: string;
  language: "French" | "Dutch" | "German" | "English";
  /** The campaign geography entry this area expands. */
  from: string;
};

const COUNTRY_NAMES: Record<string, string> = {
  LU: "Luxembourg", BE: "Belgium", FR: "France", DE: "Germany", NL: "Netherlands", CH: "Switzerland",
};

const BELGIAN_PROVINCES: Omit<SearchArea, "from">[] = [
  { name: "Hainaut", country: "Belgium", language: "French" },
  { name: "Namur", country: "Belgium", language: "French" },
  { name: "Liège", country: "Belgium", language: "French" },
  { name: "province de Luxembourg", country: "Belgium", language: "French" },
  { name: "Brabant wallon", country: "Belgium", language: "French" },
  { name: "Bruxelles", country: "Belgium", language: "French" },
  { name: "Antwerpen", country: "Belgium", language: "Dutch" },
  { name: "Limburg", country: "Belgium", language: "Dutch" },
  { name: "Oost-Vlaanderen", country: "Belgium", language: "Dutch" },
  { name: "West-Vlaanderen", country: "Belgium", language: "Dutch" },
  { name: "Vlaams-Brabant", country: "Belgium", language: "Dutch" },
];

const FR = (names: string[]) => names.map((name) => ({ name, country: "France", language: "French" as const }));

/**
 * Deterministic expansion of a geography entry into the areas every run must
 * search. Countries small enough to search as one stay whole; others expand
 * to provinces or départements. Unknown entries are searched as written.
 */
const AREA_EXPANSIONS: Record<string, Omit<SearchArea, "from">[]> = {
  luxembourg: [{ name: "Luxembourg", country: "Luxembourg", language: "French" }],
  belgium: BELGIAN_PROVINCES,
  belgique: BELGIAN_PROVINCES,
  belgie: BELGIAN_PROVINCES,
  wallonia: BELGIAN_PROVINCES.slice(0, 5),
  wallonie: BELGIAN_PROVINCES.slice(0, 5),
  flanders: BELGIAN_PROVINCES.slice(6),
  vlaanderen: BELGIAN_PROVINCES.slice(6),
  brussels: [BELGIAN_PROVINCES[5]],
  bruxelles: [BELGIAN_PROVINCES[5]],
  "grand est": FR(["Moselle", "Meurthe-et-Moselle", "Meuse", "Vosges", "Bas-Rhin", "Haut-Rhin", "Ardennes", "Marne", "Aube", "Haute-Marne"]),
  lorraine: FR(["Moselle", "Meurthe-et-Moselle", "Meuse", "Vosges"]),
  alsace: FR(["Bas-Rhin", "Haut-Rhin"]),
  "champagne ardenne": FR(["Ardennes", "Marne", "Aube", "Haute-Marne"]),
  "hauts de france": FR(["Nord", "Pas-de-Calais", "Somme", "Aisne", "Oise"]),
};

export function searchAreas(geography: string[]): SearchArea[] {
  const areas = new Map<string, SearchArea>();
  for (const entry of geography) {
    const expansion = AREA_EXPANSIONS[squash(entry)];
    const code = COUNTRY_ALIASES[squash(entry)] ?? REGIONS[squash(entry)];
    const list = expansion
      ? expansion.map((area) => ({ ...area, from: entry }))
      : [
          {
            // Not in the table: searched as written, in its own country when known.
            name: entry,
            country: COUNTRY_NAMES[code ?? ""] ?? entry,
            language: code === "DE" ? ("German" as const) : code === "NL" ? ("Dutch" as const) : ("French" as const),
            from: entry,
          },
        ];
    for (const area of list) {
      const key = `${squash(area.name)}|${area.country}`;
      if (!areas.has(key)) areas.set(key, area);
    }
  }
  return [...areas.values()];
}
