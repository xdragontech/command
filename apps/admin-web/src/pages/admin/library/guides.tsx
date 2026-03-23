import { PromptStatus } from "@prisma/client";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { AdminCard } from "../../../components/AdminCard";
import { AdminLayout } from "../../../components/AdminLayout";
import { requireBackofficePage } from "../../../server/backofficeAuth";

type BrandOption = {
  id: string;
  brandKey: string;
  name: string;
  status: string;
};

type GuideCategoryRecord = {
  id: string;
  name: string;
  slug: string;
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  sortOrder: number;
  createdAt: string;
  guideCount: number;
};

type GuideRecord = {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: PromptStatus;
  tags: string[];
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  createdAt: string;
  updatedAt: string;
};

type GuidesPageProps = {
  principal: string;
  role: string;
  brands: string[];
};

type GuideForm = {
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: PromptStatus;
  brandId: string;
  categoryId: string;
  tags: string;
};

type GuideCategoryForm = {
  name: string;
  brandId: string;
};

const NEW_GUIDE_ID = "__new_guide__";
const NEW_GUIDE_CATEGORY_ID = "__new_guide_category__";

function blankGuideForm(brands: BrandOption[]): GuideForm {
  return {
    title: "",
    slug: "",
    summary: "",
    content: "",
    status: PromptStatus.DRAFT,
    brandId: brands[0]?.id || "",
    categoryId: "",
    tags: "",
  };
}

function guideFormFromRecord(guide: GuideRecord): GuideForm {
  return {
    title: guide.title,
    slug: guide.slug,
    summary: guide.summary,
    content: guide.content,
    status: guide.status,
    brandId: guide.brandId || "",
    categoryId: guide.categoryId || "",
    tags: (guide.tags || []).join(", "),
  };
}

function blankGuideCategoryForm(brands: BrandOption[]): GuideCategoryForm {
  return {
    name: "",
    brandId: brands[0]?.id || "",
  };
}

function guideCategoryFormFromRecord(category: GuideCategoryRecord): GuideCategoryForm {
  return {
    name: category.name,
    brandId: category.brandId || "",
  };
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function StatusPill({ status }: { status: PromptStatus }) {
  const style =
    status === PromptStatus.PUBLISHED
      ? toneStyles.success
      : status === PromptStatus.ARCHIVED
        ? toneStyles.slate
        : toneStyles.warning;

  return <span style={{ ...pillStyle, ...style }}>{status}</span>;
}

export default function GuidesLibraryPage({
  principal,
  role,
  brands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [categories, setCategories] = useState<GuideCategoryRecord[]>([]);
  const [guides, setGuides] = useState<GuideRecord[]>([]);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [guideForm, setGuideForm] = useState<GuideForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<GuideCategoryForm | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PromptStatus>("ALL");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [savingGuide, setSavingGuide] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [busyGuideAction, setBusyGuideAction] = useState<"delete" | null>(null);
  const [busyCategoryAction, setBusyCategoryAction] = useState<"delete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedGuide =
    selectedGuideId && selectedGuideId !== NEW_GUIDE_ID
      ? guides.find((guide) => guide.id === selectedGuideId) || null
      : null;
  const selectedCategory =
    selectedCategoryId && selectedCategoryId !== NEW_GUIDE_CATEGORY_ID
      ? categories.find((category) => category.id === selectedCategoryId) || null
      : null;

  const filteredBrandOptions = useMemo(
    () => brandOptions.filter((brand) => brand.status !== "DISABLED"),
    [brandOptions]
  );

  const categoryOptionsForGuide = useMemo(() => {
    if (!guideForm?.brandId) return categories;
    return categories.filter((category) => category.brandId === guideForm.brandId);
  }, [categories, guideForm?.brandId]);

  async function loadData(options?: {
    nextGuideSelection?: string | null;
    nextCategorySelection?: string | null;
    nextBrandFilter?: string;
    nextStatusFilter?: "ALL" | PromptStatus;
    nextCategoryFilter?: string;
    nextSearch?: string;
  }) {
    const resolvedBrandFilter = options?.nextBrandFilter ?? brandFilter;
    const resolvedStatusFilter = options?.nextStatusFilter ?? statusFilter;
    const resolvedCategoryFilter = options?.nextCategoryFilter ?? categoryFilter;
    const resolvedSearch = options?.nextSearch ?? search;

    setLoading(true);
    setError("");

    try {
      const guideParams = new URLSearchParams();
      if (resolvedSearch.trim()) guideParams.set("q", resolvedSearch.trim());
      if (resolvedStatusFilter !== "ALL") guideParams.set("status", resolvedStatusFilter);
      if (resolvedBrandFilter !== "ALL") guideParams.set("brandId", resolvedBrandFilter);
      if (resolvedCategoryFilter !== "ALL") guideParams.set("categoryId", resolvedCategoryFilter);

      const categoryParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") categoryParams.set("brandId", resolvedBrandFilter);

      const [guidesRes, categoriesRes, brandsRes] = await Promise.all([
        fetch(`/api/admin/library/guides?${guideParams.toString()}`),
        fetch(`/api/admin/library/guide-categories?${categoryParams.toString()}`),
        fetch("/api/admin/brands"),
      ]);

      const [guidesPayload, categoriesPayload, brandsPayload] = await Promise.all([
        guidesRes.json().catch(() => null),
        categoriesRes.json().catch(() => null),
        brandsRes.json().catch(() => null),
      ]);

      if (!guidesRes.ok || !guidesPayload?.ok) {
        throw new Error(guidesPayload?.error || "Failed to load guides");
      }
      if (!categoriesRes.ok || !categoriesPayload?.ok) {
        throw new Error(categoriesPayload?.error || "Failed to load guide categories");
      }
      if (!brandsRes.ok || !brandsPayload?.ok) {
        throw new Error(brandsPayload?.error || "Failed to load brands");
      }

      const nextGuides = Array.isArray(guidesPayload.guides) ? (guidesPayload.guides as GuideRecord[]) : [];
      const nextCategories = Array.isArray(categoriesPayload.categories)
        ? (categoriesPayload.categories as GuideCategoryRecord[])
        : [];
      const nextBrands = Array.isArray(brandsPayload.brands)
        ? (brandsPayload.brands as BrandOption[])
        : [];

      setGuides(nextGuides);
      setCategories(nextCategories);
      setBrandOptions(nextBrands);

      const desiredGuideId = options?.nextGuideSelection ?? selectedGuideId;
      if (desiredGuideId === NEW_GUIDE_ID) {
        setSelectedGuideId(NEW_GUIDE_ID);
        setGuideForm(blankGuideForm(nextBrands));
      } else {
        const nextGuide =
          (desiredGuideId && nextGuides.find((guide) => guide.id === desiredGuideId)) || nextGuides[0] || null;
        setSelectedGuideId(nextGuide ? nextGuide.id : NEW_GUIDE_ID);
        setGuideForm(nextGuide ? guideFormFromRecord(nextGuide) : blankGuideForm(nextBrands));
      }

      const desiredCategoryId = options?.nextCategorySelection ?? selectedCategoryId;
      if (desiredCategoryId === NEW_GUIDE_CATEGORY_ID) {
        setSelectedCategoryId(NEW_GUIDE_CATEGORY_ID);
        setCategoryForm(blankGuideCategoryForm(nextBrands));
      } else {
        const nextCategory =
          (desiredCategoryId && nextCategories.find((category) => category.id === desiredCategoryId)) ||
          nextCategories[0] ||
          null;
        setSelectedCategoryId(nextCategory ? nextCategory.id : NEW_GUIDE_CATEGORY_ID);
        setCategoryForm(nextCategory ? guideCategoryFormFromRecord(nextCategory) : blankGuideCategoryForm(nextBrands));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load guides");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!guideForm) return;
    if (!guideForm.categoryId) return;
    if (categoryOptionsForGuide.some((category) => category.id === guideForm.categoryId)) return;
    setGuideForm((current) => (current ? { ...current, categoryId: "" } : current));
  }, [categoryOptionsForGuide, guideForm]);

  function startNewGuide() {
    setSelectedGuideId(NEW_GUIDE_ID);
    setGuideForm(blankGuideForm(filteredBrandOptions.length ? filteredBrandOptions : brandOptions));
    setError("");
    setNotice("");
  }

  function selectGuide(guide: GuideRecord) {
    setSelectedGuideId(guide.id);
    setGuideForm(guideFormFromRecord(guide));
    setError("");
    setNotice("");
  }

  function startNewCategory() {
    setSelectedCategoryId(NEW_GUIDE_CATEGORY_ID);
    setCategoryForm(blankGuideCategoryForm(filteredBrandOptions.length ? filteredBrandOptions : brandOptions));
    setError("");
    setNotice("");
  }

  function selectCategory(category: GuideCategoryRecord) {
    setSelectedCategoryId(category.id);
    setCategoryForm(guideCategoryFormFromRecord(category));
    setError("");
    setNotice("");
  }

  async function saveGuide() {
    if (!guideForm) return;
    if (!guideForm.title.trim()) return setLocalError("Guide title is required");
    if (!guideForm.slug.trim()) return setLocalError("Guide slug is required");
    if (!guideForm.summary.trim()) return setLocalError("Guide summary is required");
    if (!guideForm.content.trim()) return setLocalError("Guide content is required");
    if (!guideForm.brandId) return setLocalError("Guide brand is required");

    setSavingGuide(true);
    clearMessages();

    try {
      if (selectedGuideId === NEW_GUIDE_ID || !selectedGuide) {
        const response = await fetch("/api/admin/library/guides", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(guideForm),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to create guide");
        }
        const created = payload.guide as GuideRecord;
        setNotice("Guide created.");
        await loadData({ nextGuideSelection: created.id });
      } else {
        const response = await fetch(`/api/admin/library/guides/${encodeURIComponent(selectedGuide.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: guideForm.title,
            slug: guideForm.slug,
            summary: guideForm.summary,
            content: guideForm.content,
            status: guideForm.status,
            categoryId: guideForm.categoryId || null,
            tags: guideForm.tags,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to update guide");
        }
        setNotice("Guide saved.");
        await loadData({ nextGuideSelection: selectedGuide.id });
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save guide");
      setNotice("");
    } finally {
      setSavingGuide(false);
    }
  }

  async function deleteGuide() {
    if (!selectedGuide) return;
    if (!window.confirm(`Delete guide "${selectedGuide.title}"?`)) return;

    setBusyGuideAction("delete");
    clearMessages();

    try {
      const response = await fetch(`/api/admin/library/guides/${encodeURIComponent(selectedGuide.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to delete guide");
      }
      setNotice("Guide deleted.");
      await loadData({ nextGuideSelection: null });
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete guide");
      setNotice("");
    } finally {
      setBusyGuideAction(null);
    }
  }

  async function saveCategory() {
    if (!categoryForm) return;
    if (!categoryForm.name.trim()) return setLocalError("Guide category name is required");
    if (!categoryForm.brandId) return setLocalError("Guide category brand is required");

    setSavingCategory(true);
    clearMessages();

    try {
      if (selectedCategoryId === NEW_GUIDE_CATEGORY_ID || !selectedCategory) {
        const response = await fetch("/api/admin/library/guide-categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryForm),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to create guide category");
        }
        const created = payload.category as GuideCategoryRecord;
        setNotice("Guide category created.");
        await loadData({ nextCategorySelection: created.id });
      } else {
        const response = await fetch(`/api/admin/library/guide-categories/${encodeURIComponent(selectedCategory.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: categoryForm.name }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to update guide category");
        }
        setNotice("Guide category saved.");
        await loadData({ nextCategorySelection: selectedCategory.id });
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save guide category");
      setNotice("");
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory() {
    if (!selectedCategory) return;
    if (!window.confirm(`Delete guide category "${selectedCategory.name}"?`)) return;

    setBusyCategoryAction("delete");
    clearMessages();

    try {
      const response = await fetch(`/api/admin/library/guide-categories/${encodeURIComponent(selectedCategory.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to delete guide category");
      }
      setNotice("Guide category deleted.");
      await loadData({ nextCategorySelection: null });
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete guide category");
      setNotice("");
    } finally {
      setBusyCategoryAction(null);
    }
  }

  async function applyFilters(next: {
    search?: string;
    status?: "ALL" | PromptStatus;
    brandId?: string;
    categoryId?: string;
  }) {
    const nextSearch = next.search ?? search;
    const nextStatus = next.status ?? statusFilter;
    const nextBrandId = next.brandId ?? brandFilter;
    const nextCategoryId = next.categoryId ?? categoryFilter;

    setSearch(nextSearch);
    setStatusFilter(nextStatus);
    setBrandFilter(nextBrandId);
    setCategoryFilter(nextCategoryId);
    await loadData({
      nextSearch,
      nextStatusFilter: nextStatus,
      nextBrandFilter: nextBrandId,
      nextCategoryFilter: nextCategoryId,
    });
  }

  function clearMessages() {
    setError("");
    setNotice("");
  }

  function setLocalError(message: string) {
    setError(message);
    setNotice("");
  }

  return (
    <AdminLayout
      title="Command Admin — Library / Guides"
      sectionLabel="Library"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="library"
    >
      <AdminCard
        title="Guides"
        description="Brand-scoped guide and guide-category management backed by Article and ArticleCategory with corrected brand-scoped uniqueness."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="button" onClick={() => void loadData()} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" onClick={startNewGuide} style={primaryButtonStyle}>
              Add Guide
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          <div
            style={{
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "minmax(0, 1.1fr) repeat(3, minmax(180px, 0.7fr)) auto",
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onBlur={() => void applyFilters({ search })}
              placeholder="Search guides…"
              style={inputStyle}
            />
            <select
              value={statusFilter}
              onChange={(event) => void applyFilters({ status: event.target.value as "ALL" | PromptStatus })}
              style={inputStyle}
            >
              <option value="ALL">All Statuses</option>
              <option value={PromptStatus.DRAFT}>Draft</option>
              <option value={PromptStatus.PUBLISHED}>Published</option>
              <option value={PromptStatus.ARCHIVED}>Archived</option>
            </select>
            <select value={brandFilter} onChange={(event) => void applyFilters({ brandId: event.target.value, categoryId: "ALL" })} style={inputStyle}>
              <option value="ALL">All Brands</option>
              {brandOptions.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name} ({brand.brandKey})
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => void applyFilters({ categoryId: event.target.value })}
              style={inputStyle}
            >
              <option value="ALL">All Guide Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div style={countStyle}>{guides.length} loaded</div>
          </div>

          {error ? <div style={errorStyle}>{error}</div> : null}
          {notice ? <div style={noticeStyle}>{notice}</div> : null}

          <div
            style={{
              display: "grid",
              gap: "18px",
              gridTemplateColumns: "minmax(280px, 0.9fr) minmax(0, 1.35fr)",
            }}
          >
            <div style={listPanelStyle}>
              <div style={listHeaderStyle}>Guide Directory</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {guides.map((guide) => {
                  const active = selectedGuideId === guide.id;
                  return (
                    <button
                      key={guide.id}
                      type="button"
                      onClick={() => selectGuide(guide)}
                      style={{
                        ...listItemStyle,
                        ...(active ? listItemActiveStyle : null),
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "left" }}>{guide.title}</div>
                        <StatusPill status={guide.status} />
                      </div>
                      <div style={{ marginTop: "6px", color: "#64748b", textAlign: "left", fontSize: "0.84rem" }}>
                        {guide.brandName || "Unknown brand"}
                        {guide.categoryName ? ` • ${guide.categoryName}` : ""}
                      </div>
                      <div style={{ marginTop: "8px", color: "#64748b", textAlign: "left", fontSize: "0.8rem" }}>
                        Updated {formatDate(guide.updatedAt)}
                      </div>
                    </button>
                  );
                })}

                {!guides.length ? <div style={emptyStateStyle}>No guides found for the current filters.</div> : null}
              </div>
            </div>

            <div style={editorPanelStyle}>
              <div style={editorHeaderRowStyle}>
                <div>
                  <div style={editorTitleStyle}>
                    {selectedGuideId === NEW_GUIDE_ID || !selectedGuide ? "New Guide" : selectedGuide.title}
                  </div>
                  <div style={editorMetaStyle}>
                    {selectedGuide
                      ? `Created ${formatDate(selectedGuide.createdAt)} • Updated ${formatDate(selectedGuide.updatedAt)}`
                      : "Create a new guide for a selected brand."}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {selectedGuide ? (
                    <button
                      type="button"
                      onClick={deleteGuide}
                      disabled={busyGuideAction === "delete"}
                      style={dangerButtonStyle}
                    >
                      {busyGuideAction === "delete" ? "Deleting…" : "Delete Guide"}
                    </button>
                  ) : null}
                  <button type="button" onClick={saveGuide} disabled={savingGuide} style={primaryButtonStyle}>
                    {savingGuide ? "Saving…" : selectedGuide ? "Save Guide" : "Create Guide"}
                  </button>
                </div>
              </div>

              {guideForm ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={formGridStyle}>
                    <label style={fieldLabelStyle}>
                      <span>Title</span>
                      <input
                        value={guideForm.title}
                        onChange={(event) => setGuideForm((current) => (current ? { ...current, title: event.target.value } : current))}
                        style={inputStyle}
                      />
                    </label>

                    <label style={fieldLabelStyle}>
                      <span>Slug</span>
                      <input
                        value={guideForm.slug}
                        onChange={(event) => setGuideForm((current) => (current ? { ...current, slug: event.target.value } : current))}
                        style={inputStyle}
                      />
                    </label>

                    <label style={fieldLabelStyle}>
                      <span>Status</span>
                      <select
                        value={guideForm.status}
                        onChange={(event) =>
                          setGuideForm((current) =>
                            current ? { ...current, status: event.target.value as PromptStatus } : current
                          )
                        }
                        style={inputStyle}
                      >
                        <option value={PromptStatus.DRAFT}>Draft</option>
                        <option value={PromptStatus.PUBLISHED}>Published</option>
                        <option value={PromptStatus.ARCHIVED}>Archived</option>
                      </select>
                    </label>

                    <label style={fieldLabelStyle}>
                      <span>Brand</span>
                      <select
                        value={guideForm.brandId}
                        onChange={(event) =>
                          setGuideForm((current) =>
                            current
                              ? {
                                  ...current,
                                  brandId: event.target.value,
                                  categoryId:
                                    categoryOptionsForGuide.some((category) => category.id === current.categoryId)
                                      ? current.categoryId
                                      : "",
                                }
                              : current
                          )
                        }
                        disabled={Boolean(selectedGuide)}
                        style={selectedGuide ? disabledInputStyle : inputStyle}
                      >
                        <option value="">Select Brand</option>
                        {filteredBrandOptions.map((brand) => (
                          <option key={brand.id} value={brand.id}>
                            {brand.name} ({brand.brandKey})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={fieldLabelStyle}>
                      <span>Guide Category</span>
                      <select
                        value={guideForm.categoryId}
                        onChange={(event) =>
                          setGuideForm((current) => (current ? { ...current, categoryId: event.target.value } : current))
                        }
                        style={inputStyle}
                      >
                        <option value="">Uncategorized</option>
                        {categoryOptionsForGuide.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label style={fieldLabelStyle}>
                      <span>Tags</span>
                      <input
                        value={guideForm.tags}
                        onChange={(event) => setGuideForm((current) => (current ? { ...current, tags: event.target.value } : current))}
                        placeholder="comma, separated, tags"
                        style={inputStyle}
                      />
                    </label>
                  </div>

                  <label style={fieldLabelStyle}>
                    <span>Summary</span>
                    <textarea
                      value={guideForm.summary}
                      onChange={(event) =>
                        setGuideForm((current) => (current ? { ...current, summary: event.target.value } : current))
                      }
                      rows={3}
                      style={textareaStyle}
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    <span>Content</span>
                    <textarea
                      value={guideForm.content}
                      onChange={(event) =>
                        setGuideForm((current) => (current ? { ...current, content: event.target.value } : current))
                      }
                      rows={14}
                      style={textareaStyle}
                    />
                  </label>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </AdminCard>

      <AdminCard
        title="Guide Categories"
        description="Guide categories are now brand-scoped at the schema level, so the same category names and slugs can exist in different brands without collision."
        actions={
          <button type="button" onClick={startNewCategory} style={primaryButtonStyle}>
            Add Guide Category
          </button>
        }
      >
        <div
          style={{
            display: "grid",
            gap: "18px",
            gridTemplateColumns: "minmax(280px, 0.85fr) minmax(0, 1fr)",
          }}
        >
          <div style={listPanelStyle}>
            <div style={listHeaderStyle}>Guide Category Directory</div>
            <div style={{ display: "grid", gap: "10px" }}>
              {categories.map((category) => {
                const active = selectedCategoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => selectCategory(category)}
                    style={{
                      ...listItemStyle,
                      ...(active ? listItemActiveStyle : null),
                    }}
                  >
                    <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "left" }}>{category.name}</div>
                    <div style={{ marginTop: "6px", color: "#64748b", textAlign: "left", fontSize: "0.84rem" }}>
                      {category.brandName || "Unknown brand"} • {category.guideCount} guide{category.guideCount === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })}

              {!categories.length ? <div style={emptyStateStyle}>No guide categories found for the current brand scope.</div> : null}
            </div>
          </div>

          <div style={editorPanelStyle}>
            <div style={editorHeaderRowStyle}>
              <div>
                <div style={editorTitleStyle}>
                  {selectedCategoryId === NEW_GUIDE_CATEGORY_ID || !selectedCategory
                    ? "New Guide Category"
                    : selectedCategory.name}
                </div>
                <div style={editorMetaStyle}>
                  {selectedCategory
                    ? `${selectedCategory.guideCount} guide${selectedCategory.guideCount === 1 ? "" : "s"} • Created ${formatDate(selectedCategory.createdAt)}`
                    : "Create a guide category for a selected brand."}
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                {selectedCategory ? (
                  <button
                    type="button"
                    onClick={deleteCategory}
                    disabled={busyCategoryAction === "delete"}
                    style={dangerButtonStyle}
                  >
                    {busyCategoryAction === "delete" ? "Deleting…" : "Delete Category"}
                  </button>
                ) : null}
                <button type="button" onClick={saveCategory} disabled={savingCategory} style={primaryButtonStyle}>
                  {savingCategory ? "Saving…" : selectedCategory ? "Save Category" : "Create Category"}
                </button>
              </div>
            </div>

            {categoryForm ? (
              <div style={{ display: "grid", gap: "14px" }}>
                <label style={fieldLabelStyle}>
                  <span>Name</span>
                  <input
                    value={categoryForm.name}
                    onChange={(event) =>
                      setCategoryForm((current) => (current ? { ...current, name: event.target.value } : current))
                    }
                    style={inputStyle}
                  />
                </label>

                <label style={fieldLabelStyle}>
                  <span>Brand</span>
                  <select
                    value={categoryForm.brandId}
                    onChange={(event) =>
                      setCategoryForm((current) => (current ? { ...current, brandId: event.target.value } : current))
                    }
                    disabled={Boolean(selectedCategory)}
                    style={selectedCategory ? disabledInputStyle : inputStyle}
                  >
                    <option value="">Select Brand</option>
                    {filteredBrandOptions.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name} ({brand.brandKey})
                      </option>
                    ))}
                  </select>
                </label>

                {selectedCategory ? (
                  <div style={metaNoteStyle}>
                    Slug: <strong>{selectedCategory.slug}</strong>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </AdminCard>
    </AdminLayout>
  );
}

export const getServerSideProps: GetServerSideProps<GuidesPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/library/guides" });
  if (!auth.ok) return auth.response;

  return {
    props: {
      principal: auth.loggedInAs || auth.principal.displayName,
      role: auth.principal.role,
      brands: auth.principal.allowedBrandKeys,
    },
  };
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "12px",
  padding: "6px 10px",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const toneStyles = {
  success: {
    background: "rgba(34,197,94,0.14)",
    color: "#166534",
  },
  warning: {
    background: "rgba(245,158,11,0.15)",
    color: "#92400e",
  },
  slate: {
    background: "rgba(148,163,184,0.16)",
    color: "#334155",
  },
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

const disabledInputStyle: CSSProperties = {
  ...inputStyle,
  background: "rgba(241,245,249,0.95)",
  color: "#64748b",
  cursor: "not-allowed",
};

const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: "120px",
  resize: "vertical",
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

const dangerButtonStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(239,68,68,0.35)",
  background: "rgba(254,242,242,0.95)",
  color: "#991b1b",
  padding: "10px 14px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const countStyle: CSSProperties = {
  alignSelf: "center",
  justifySelf: "end",
  color: "#475569",
  fontSize: "0.92rem",
  fontWeight: 600,
};

const listPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  padding: "18px",
  display: "grid",
  gap: "14px",
  alignSelf: "start",
};

const listHeaderStyle: CSSProperties = {
  fontWeight: 700,
  color: "#0f172a",
  fontSize: "0.96rem",
};

const listItemStyle: CSSProperties = {
  width: "100%",
  textAlign: "left",
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(255,255,255,0.96)",
  padding: "14px",
  cursor: "pointer",
};

const listItemActiveStyle: CSSProperties = {
  border: "1px solid rgba(239,68,68,0.28)",
  background: "rgba(254,226,226,0.78)",
};

const editorPanelStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(255,255,255,0.96)",
  padding: "20px",
  display: "grid",
  gap: "16px",
};

const editorHeaderRowStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: "14px",
};

const editorTitleStyle: CSSProperties = {
  fontSize: "1.2rem",
  fontWeight: 800,
  color: "#0f172a",
};

const editorMetaStyle: CSSProperties = {
  marginTop: "6px",
  color: "#64748b",
  fontSize: "0.88rem",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gap: "14px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
};

const fieldLabelStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  color: "#334155",
  fontSize: "0.9rem",
  fontWeight: 600,
};

const emptyStateStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px dashed rgba(148,163,184,0.34)",
  background: "rgba(255,255,255,0.88)",
  padding: "16px",
  color: "#64748b",
  fontSize: "0.92rem",
  lineHeight: 1.6,
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

const metaNoteStyle: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  padding: "12px 14px",
  color: "#475569",
  fontSize: "0.9rem",
};
