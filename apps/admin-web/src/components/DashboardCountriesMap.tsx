import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature, mesh } from "topojson-client";
import worldCountries from "world-countries";
import countriesAtlas from "world-atlas/countries-110m.json";

type CountryMetricMode = "signups" | "clientLogins" | "backofficeLogins";

type CountryMetricRow = {
  country: string | null;
  countryIso2: string | null;
  count: number;
};

const WORLD_ATLAS = countriesAtlas as any;
const WORLD_COUNTRY_INFO_BY_NUMERIC = new Map(
  worldCountries
    .filter((country) => country.ccn3 && country.cca2)
    .map((country) => [
      country.ccn3.padStart(3, "0"),
      { iso2: country.cca2.toUpperCase(), name: country.name.common },
    ])
);
const WORLD_LAND = feature(WORLD_ATLAS, WORLD_ATLAS.objects.land) as any;
const WORLD_COUNTRIES = (feature(WORLD_ATLAS, WORLD_ATLAS.objects.countries) as any).features.map((country: any) => ({
  ...country,
  iso2: country.id ? WORLD_COUNTRY_INFO_BY_NUMERIC.get(String(country.id).padStart(3, "0"))?.iso2 || null : null,
  name: country.id ? WORLD_COUNTRY_INFO_BY_NUMERIC.get(String(country.id).padStart(3, "0"))?.name || null : null,
}));
const WORLD_BORDERS = mesh(WORLD_ATLAS, WORLD_ATLAS.objects.countries, (left: any, right: any) => left !== right) as any;
const WORLD_PROJECTION = geoNaturalEarth1().fitExtent(
  [
    [10, 16],
    [950, 504],
  ],
  WORLD_LAND
);
const WORLD_PATH = geoPath(WORLD_PROJECTION);

export default function DashboardCountriesMap({
  rows,
  mode,
}: {
  rows: CountryMetricRow[];
  mode: CountryMetricMode;
}) {
  const palette =
    mode === "signups"
      ? { base: "185,28,28", accent: "#b91c1c" }
      : mode === "clientLogins"
        ? { base: "15,23,42", accent: "#0f172a" }
        : { base: "37,99,235", accent: "#2563eb" };
  const countsByIso2 = new Map(
    rows.filter((row) => row.countryIso2).map((row) => [String(row.countryIso2).toUpperCase(), row.count])
  );
  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  const empty = rows.length === 0;
  const emptyLabel =
    mode === "signups"
      ? "No signup country data is available for this period yet."
      : mode === "clientLogins"
        ? "No client login country data is available for this period yet."
        : "No backoffice login country data is available for this period yet.";

  function fillForCountry(iso2: string | null) {
    if (!iso2) return "rgba(255,255,255,0.88)";
    const count = countsByIso2.get(iso2) || 0;
    if (!count) return "rgba(255,255,255,0.88)";
    const intensity = count / maxCount;
    return `rgba(${palette.base}, ${Math.min(0.84, 0.18 + intensity * 0.62).toFixed(3)})`;
  }

  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <svg
        viewBox="0 0 960 520"
        style={{
          width: "100%",
          height: "320px",
          borderRadius: "12px",
          border: "1px solid var(--admin-border-subtle)",
          background: "linear-gradient(180deg, var(--admin-surface-secondary) 0%, var(--admin-surface-tertiary) 100%)",
        }}
        role="img"
        aria-label="Country activity heat map"
      >
        <path d={WORLD_PATH(WORLD_LAND) || undefined} fill="rgba(226,232,240,0.45)" stroke="none" />

        <g>
          {WORLD_COUNTRIES.map((country: any) => (
            <path
              key={String(country.id || country.iso2 || country.name || "country")}
              d={WORLD_PATH(country) || undefined}
              fill={fillForCountry(country.iso2)}
              stroke="rgba(148,163,184,0.62)"
              strokeWidth="0.65"
              vectorEffect="non-scaling-stroke"
            >
              <title>{country.name || country.iso2 || "Unknown country"}</title>
            </path>
          ))}
        </g>

        <path
          d={WORLD_PATH(WORLD_BORDERS) || undefined}
          fill="none"
          stroke={palette.accent}
          strokeOpacity={0.24}
          strokeWidth="0.75"
          vectorEffect="non-scaling-stroke"
        />

        {empty ? (
          <g>
            <rect x="300" y="226" width="360" height="68" rx="14" fill="rgba(255,255,255,0.88)" />
            <text
              x="480"
              y="265"
              textAnchor="middle"
              fill="#475569"
              fontSize="21"
              fontWeight="600"
              fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
            >
              No country activity in this range
            </text>
          </g>
        ) : null}
      </svg>

      {!rows.length ? (
        <div style={{ color: "var(--admin-text-secondary)", fontSize: "0.88rem" }}>{emptyLabel}</div>
      ) : null}
    </div>
  );
}
