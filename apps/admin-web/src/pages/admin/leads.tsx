import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../components/AdminCard";
import { AdminLayout } from "../../components/AdminLayout";
import { formatAdminDateTime } from "../../lib/adminDates";
import { requireBackofficePage } from "../../server/backofficeAuth";

type LeadSource = "chat" | "contact";

type LeadRow = {
  ts: string;
  source: LeadSource;
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  ip?: string;
  name?: string | null;
  email?: string | null;
  raw: any;
};

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
};

type LeadsProps = {
  principal: string;
  role: string;
  brands: string[];
};

export default function LeadsPage({ principal, role, brands }: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [items, setItems] = useState<LeadRow[]>([]);
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | LeadSource>("all");
  const [brandId, setBrandId] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadData(nextKind = kind, nextBrandId = brandId) {
    setLoading(true);
    setError("");

    try {
      const leadsParams = new URLSearchParams();
      leadsParams.set("kind", nextKind);
      leadsParams.set("limit", "200");
      if (nextBrandId !== "all") {
        leadsParams.set("brandId", nextBrandId);
      }

      const [leadsRes, brandsRes] = await Promise.all([fetch(`/api/admin/leads?${leadsParams.toString()}`), fetch("/api/admin/brands")]);
      const [leadsPayload, brandsPayload] = await Promise.all([
        leadsRes.json().catch(() => null),
        brandsRes.json().catch(() => null),
      ]);

      if (!leadsRes.ok || !leadsPayload?.ok) {
        throw new Error(leadsPayload?.error || "Failed to load leads");
      }

      if (!brandsRes.ok || !brandsPayload?.ok) {
        throw new Error(brandsPayload?.error || "Failed to load brands");
      }

      setItems(Array.isArray(leadsPayload.items) ? (leadsPayload.items as LeadRow[]) : []);
      setBrandOptions(
        Array.isArray(brandsPayload.brands)
          ? brandsPayload.brands.map((brand: any) => ({
              id: brand.id,
              brandKey: brand.brandKey,
              name: brand.name,
            }))
          : []
      );
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load leads");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) =>
      [
        item.name || "",
        item.email || "",
        item.brandKey || "",
        item.brandName || "",
        item.ip || "",
        item.source,
        item.ts,
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [items, search]);

  function copyJson(row: LeadRow) {
    navigator.clipboard
      .writeText(JSON.stringify(row.raw, null, 2))
      .then(() => {
        setNotice("Lead JSON copied.");
        setError("");
      })
      .catch(() => {
        setError("Failed to copy lead JSON");
        setNotice("");
      });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(filteredItems.map((item) => item.raw), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leads_${kind}_${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Exported JSON.");
    setError("");
  }

  function exportCsv() {
    const header = ["brandKey", "brandName", "name", "email", "source", "ip", "ts"];
    const rows = [
      header.join(","),
      ...filteredItems.map((item) =>
        header
          .map((key) => {
            const value = (item as any)[key] ?? "";
            return `"${String(value).replace(/"/g, '""')}"`;
          })
          .join(",")
      ),
    ];

    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `leads_${kind}_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Exported CSV.");
    setError("");
  }

  async function handleRefresh() {
    await loadData();
  }

  async function handleKindChange(nextKind: "all" | LeadSource) {
    setKind(nextKind);
    await loadData(nextKind, brandId);
  }

  async function handleBrandChange(nextBrandId: string) {
    setBrandId(nextBrandId);
    await loadData(kind, nextBrandId);
  }

  return (
    <AdminLayout
      title="Command Admin — Leads"
      sectionLabel="Leads"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="leads"
    >
      <AdminCard
        title="Leads"
        description="Recent contact and chat leads from the DB event stream. Staff access is automatically limited to assigned brands."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="button" onClick={handleRefresh} disabled={loading} style={primaryButtonStyle}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" onClick={exportCsv} disabled={loading || filteredItems.length === 0} style={secondaryButtonStyle}>
              Export CSV
            </button>
            <button type="button" onClick={exportJson} disabled={loading || filteredItems.length === 0} style={secondaryButtonStyle}>
              Export JSON
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          <div
            style={{
              display: "grid",
              gap: "14px",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search leads…"
              style={inputStyle}
            />

            <select value={kind} onChange={(event) => void handleKindChange(event.target.value as "all" | LeadSource)} style={inputStyle}>
              <option value="all">All Sources</option>
              <option value="chat">Chat</option>
              <option value="contact">Contact</option>
            </select>

            <select value={brandId} onChange={(event) => void handleBrandChange(event.target.value)} style={inputStyle}>
              <option value="all">All Brands</option>
              {brandOptions.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name} ({brand.brandKey})
                </option>
              ))}
            </select>

            <div style={countStyle}>
              {filteredItems.length} shown
              {items.length !== filteredItems.length ? ` of ${items.length}` : ""}
            </div>
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}
          {notice ? <div style={noticeStyle}>{notice}</div> : null}

          <div style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid rgba(148,163,184,0.24)" }}>
            <table style={{ width: "100%", minWidth: "1020px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(248,250,252,0.9)", color: "#475569" }}>
                  <th style={tableHeaderStyle}>Brand</th>
                  <th style={tableHeaderStyle}>Name</th>
                  <th style={tableHeaderStyle}>Email</th>
                  <th style={tableHeaderStyle}>Source</th>
                  <th style={tableHeaderStyle}>IP</th>
                  <th style={tableHeaderStyle}>Date/Time</th>
                  <th style={{ ...tableHeaderStyle, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => (
                  <tr key={`${item.source}-${item.ts}-${index}`} style={{ borderTop: "1px solid rgba(226,232,240,0.95)" }}>
                    <td style={tableCellStyle}>
                      <div style={{ fontWeight: 700, color: "#0f172a" }}>{item.brandName || "Unknown"}</div>
                      <div style={{ color: "#64748b", fontSize: "0.82rem" }}>{item.brandKey || "No brand key"}</div>
                    </td>
                    <td style={tableCellStyle}>{item.name || "—"}</td>
                    <td style={tableCellStyle}>{item.email || "—"}</td>
                    <td style={tableCellStyle}>
                      <span style={item.source === "chat" ? sourceChipChatStyle : sourceChipContactStyle}>
                        {item.source}
                      </span>
                    </td>
                    <td style={{ ...tableCellStyle, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.84rem" }}>
                      {item.ip || "—"}
                    </td>
                    <td style={tableCellStyle}>
                      {formatAdminDateTime(item.ts)}
                    </td>
                    <td style={{ ...tableCellStyle, textAlign: "right" }}>
                      <button type="button" onClick={() => copyJson(item)} style={secondaryButtonStyle}>
                        Copy JSON
                      </button>
                    </td>
                  </tr>
                ))}

                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "28px 18px", textAlign: "center", color: "#64748b" }}>
                      No leads found.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<LeadsProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, {
    callbackUrl: "/admin/leads",
  });
  if (!auth.ok) return auth.response;

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.34)",
  background: "rgba(255,255,255,0.95)",
  padding: "12px 14px",
  fontSize: "0.95rem",
  color: "#0f172a",
};

const countStyle: CSSProperties = {
  alignSelf: "center",
  justifySelf: "end",
  color: "#475569",
  fontSize: "0.92rem",
  fontWeight: 600,
};

const primaryButtonStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#ffffff",
  padding: "10px 14px",
  fontSize: "0.92rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.34)",
  background: "rgba(255,255,255,0.95)",
  color: "#0f172a",
  padding: "10px 14px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const tableHeaderStyle: CSSProperties = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: "0.8rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const tableCellStyle: CSSProperties = {
  padding: "13px 14px",
  fontSize: "0.94rem",
  color: "#0f172a",
  verticalAlign: "top",
};

const sourceChipBaseStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "12px",
  padding: "6px 10px",
  fontSize: "0.8rem",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const sourceChipChatStyle: CSSProperties = {
  ...sourceChipBaseStyle,
  background: "rgba(37,99,235,0.1)",
  color: "#1d4ed8",
};

const sourceChipContactStyle: CSSProperties = {
  ...sourceChipBaseStyle,
  background: "rgba(245,158,11,0.12)",
  color: "#92400e",
};

const errorStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(254,242,242,0.94)",
  color: "#991b1b",
  padding: "14px 16px",
  fontSize: "0.95rem",
};

const noticeStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(34,197,94,0.22)",
  background: "rgba(240,253,244,0.95)",
  color: "#166534",
  padding: "14px 16px",
  fontSize: "0.95rem",
};
