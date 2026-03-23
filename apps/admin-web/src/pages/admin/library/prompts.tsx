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

type CategoryRecord = {
  id: string;
  name: string;
  slug: string;
  brandId: string | null;
  brandKey: string | null;
  brandName: string | null;
  sortOrder: number;
  createdAt: string;
  promptCount: number;
};

type PromptRecord = {
  id: string;
  title: string;
  description: string | null;
  content: string;
  status: PromptStatus;
  sortOrder: number;
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

type PromptsPageProps = {
  principal: string;
  role: string;
  brands: string[];
};

type PromptForm = {
  title: string;
  description: string;
  content: string;
  status: PromptStatus;
  brandId: string;
  categoryId: string;
};

type CategoryForm = {
  name: string;
  brandId: string;
};

const NEW_PROMPT_ID = "__new_prompt__";
const NEW_CATEGORY_ID = "__new_category__";

function blankPromptForm(brands: BrandOption[]): PromptForm {
  return {
    title: "",
    description: "",
    content: "",
    status: PromptStatus.DRAFT,
    brandId: brands[0]?.id || "",
    categoryId: "",
  };
}

function promptFormFromRecord(prompt: PromptRecord): PromptForm {
  return {
    title: prompt.title,
    description: prompt.description || "",
    content: prompt.content,
    status: prompt.status,
    brandId: prompt.brandId || "",
    categoryId: prompt.categoryId || "",
  };
}

function blankCategoryForm(brands: BrandOption[]): CategoryForm {
  return {
    name: "",
    brandId: brands[0]?.id || "",
  };
}

function categoryFormFromRecord(category: CategoryRecord): CategoryForm {
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
      ? promptStatusToneStyles.success
      : status === PromptStatus.ARCHIVED
        ? promptStatusToneStyles.slate
        : promptStatusToneStyles.warning;

  return <span style={{ ...pillStyle, ...style }}>{status}</span>;
}

export default function PromptLibraryPage({
  principal,
  role,
  brands,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [prompts, setPrompts] = useState<PromptRecord[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [promptForm, setPromptForm] = useState<PromptForm | null>(null);
  const [categoryForm, setCategoryForm] = useState<CategoryForm | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | PromptStatus>("ALL");
  const [brandFilter, setBrandFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [busyPromptAction, setBusyPromptAction] = useState<"delete" | null>(null);
  const [busyCategoryAction, setBusyCategoryAction] = useState<"delete" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedPrompt =
    selectedPromptId && selectedPromptId !== NEW_PROMPT_ID
      ? prompts.find((prompt) => prompt.id === selectedPromptId) || null
      : null;
  const selectedCategory =
    selectedCategoryId && selectedCategoryId !== NEW_CATEGORY_ID
      ? categories.find((category) => category.id === selectedCategoryId) || null
      : null;

  const filteredBrandOptions = useMemo(
    () => brandOptions.filter((brand) => brand.status !== "DISABLED"),
    [brandOptions]
  );

  const categoryOptionsForPrompt = useMemo(() => {
    if (!promptForm?.brandId) return categories;
    return categories.filter((category) => category.brandId === promptForm.brandId);
  }, [categories, promptForm?.brandId]);

  async function loadData(options?: {
    nextPromptSelection?: string | null;
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
      const promptParams = new URLSearchParams();
      if (resolvedSearch.trim()) promptParams.set("q", resolvedSearch.trim());
      if (resolvedStatusFilter !== "ALL") promptParams.set("status", resolvedStatusFilter);
      if (resolvedBrandFilter !== "ALL") promptParams.set("brandId", resolvedBrandFilter);
      if (resolvedCategoryFilter !== "ALL") promptParams.set("categoryId", resolvedCategoryFilter);

      const categoryParams = new URLSearchParams();
      if (resolvedBrandFilter !== "ALL") categoryParams.set("brandId", resolvedBrandFilter);

      const [promptsRes, categoriesRes, brandsRes] = await Promise.all([
        fetch(`/api/admin/library/prompts?${promptParams.toString()}`),
        fetch(`/api/admin/library/categories?${categoryParams.toString()}`),
        fetch("/api/admin/brands"),
      ]);

      const [promptsPayload, categoriesPayload, brandsPayload] = await Promise.all([
        promptsRes.json().catch(() => null),
        categoriesRes.json().catch(() => null),
        brandsRes.json().catch(() => null),
      ]);

      if (!promptsRes.ok || !promptsPayload?.ok) {
        throw new Error(promptsPayload?.error || "Failed to load prompts");
      }
      if (!categoriesRes.ok || !categoriesPayload?.ok) {
        throw new Error(categoriesPayload?.error || "Failed to load categories");
      }
      if (!brandsRes.ok || !brandsPayload?.ok) {
        throw new Error(brandsPayload?.error || "Failed to load brands");
      }

      const nextPrompts = Array.isArray(promptsPayload.prompts) ? (promptsPayload.prompts as PromptRecord[]) : [];
      const nextCategories = Array.isArray(categoriesPayload.categories)
        ? (categoriesPayload.categories as CategoryRecord[])
        : [];
      const nextBrands = Array.isArray(brandsPayload.brands)
        ? (brandsPayload.brands as BrandOption[])
        : [];

      setPrompts(nextPrompts);
      setCategories(nextCategories);
      setBrandOptions(nextBrands);

      const desiredPromptId = options?.nextPromptSelection ?? selectedPromptId;
      if (desiredPromptId === NEW_PROMPT_ID) {
        setSelectedPromptId(NEW_PROMPT_ID);
        setPromptForm(blankPromptForm(nextBrands));
      } else {
        const nextPrompt =
          (desiredPromptId && nextPrompts.find((prompt) => prompt.id === desiredPromptId)) || nextPrompts[0] || null;
        setSelectedPromptId(nextPrompt ? nextPrompt.id : NEW_PROMPT_ID);
        setPromptForm(nextPrompt ? promptFormFromRecord(nextPrompt) : blankPromptForm(nextBrands));
      }

      const desiredCategoryId = options?.nextCategorySelection ?? selectedCategoryId;
      if (desiredCategoryId === NEW_CATEGORY_ID) {
        setSelectedCategoryId(NEW_CATEGORY_ID);
        setCategoryForm(blankCategoryForm(nextBrands));
      } else {
        const nextCategory =
          (desiredCategoryId && nextCategories.find((category) => category.id === desiredCategoryId)) ||
          nextCategories[0] ||
          null;
        setSelectedCategoryId(nextCategory ? nextCategory.id : NEW_CATEGORY_ID);
        setCategoryForm(nextCategory ? categoryFormFromRecord(nextCategory) : blankCategoryForm(nextBrands));
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to load prompts");
      setNotice("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    if (!promptForm) return;
    if (!promptForm.categoryId) return;
    if (categoryOptionsForPrompt.some((category) => category.id === promptForm.categoryId)) return;
    setPromptForm((current) => (current ? { ...current, categoryId: "" } : current));
  }, [categoryOptionsForPrompt, promptForm]);

  function startNewPrompt() {
    setSelectedPromptId(NEW_PROMPT_ID);
    setPromptForm(blankPromptForm(filteredBrandOptions.length ? filteredBrandOptions : brandOptions));
    setError("");
    setNotice("");
  }

  function selectPrompt(prompt: PromptRecord) {
    setSelectedPromptId(prompt.id);
    setPromptForm(promptFormFromRecord(prompt));
    setError("");
    setNotice("");
  }

  function startNewCategory() {
    setSelectedCategoryId(NEW_CATEGORY_ID);
    setCategoryForm(blankCategoryForm(filteredBrandOptions.length ? filteredBrandOptions : brandOptions));
    setError("");
    setNotice("");
  }

  function selectCategory(category: CategoryRecord) {
    setSelectedCategoryId(category.id);
    setCategoryForm(categoryFormFromRecord(category));
    setError("");
    setNotice("");
  }

  async function savePrompt() {
    if (!promptForm) return;
    if (!promptForm.title.trim()) {
      setError("Prompt title is required");
      setNotice("");
      return;
    }
    if (!promptForm.content.trim()) {
      setError("Prompt content is required");
      setNotice("");
      return;
    }
    if (!promptForm.brandId) {
      setError("Prompt brand is required");
      setNotice("");
      return;
    }

    setSavingPrompt(true);
    setError("");
    setNotice("");

    try {
      if (selectedPromptId === NEW_PROMPT_ID || !selectedPrompt) {
        const response = await fetch("/api/admin/library/prompts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(promptForm),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to create prompt");
        }
        const created = payload.prompt as PromptRecord;
        setNotice("Prompt created.");
        await loadData({ nextPromptSelection: created.id });
      } else {
        const response = await fetch(`/api/admin/library/prompts/${encodeURIComponent(selectedPrompt.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: promptForm.title,
            description: promptForm.description,
            content: promptForm.content,
            status: promptForm.status,
            categoryId: promptForm.categoryId || null,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to update prompt");
        }
        setNotice("Prompt saved.");
        await loadData({ nextPromptSelection: selectedPrompt.id });
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save prompt");
      setNotice("");
    } finally {
      setSavingPrompt(false);
    }
  }

  async function deletePrompt() {
    if (!selectedPrompt) return;
    if (!window.confirm(`Delete prompt "${selectedPrompt.title}"?`)) return;

    setBusyPromptAction("delete");
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/library/prompts/${encodeURIComponent(selectedPrompt.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to delete prompt");
      }
      setNotice("Prompt deleted.");
      await loadData({ nextPromptSelection: null });
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete prompt");
      setNotice("");
    } finally {
      setBusyPromptAction(null);
    }
  }

  async function saveCategory() {
    if (!categoryForm) return;
    if (!categoryForm.name.trim()) {
      setError("Category name is required");
      setNotice("");
      return;
    }
    if (!categoryForm.brandId) {
      setError("Category brand is required");
      setNotice("");
      return;
    }

    setSavingCategory(true);
    setError("");
    setNotice("");

    try {
      if (selectedCategoryId === NEW_CATEGORY_ID || !selectedCategory) {
        const response = await fetch("/api/admin/library/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(categoryForm),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to create category");
        }
        const created = payload.category as CategoryRecord;
        setNotice("Category created.");
        await loadData({ nextCategorySelection: created.id });
      } else {
        const response = await fetch(`/api/admin/library/categories/${encodeURIComponent(selectedCategory.id)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: categoryForm.name }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.error || "Failed to update category");
        }
        setNotice("Category saved.");
        await loadData({ nextCategorySelection: selectedCategory.id });
      }
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to save category");
      setNotice("");
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory() {
    if (!selectedCategory) return;
    if (!window.confirm(`Delete category "${selectedCategory.name}"?`)) return;

    setBusyCategoryAction("delete");
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/admin/library/categories/${encodeURIComponent(selectedCategory.id)}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to delete category");
      }
      setNotice("Category deleted.");
      await loadData({ nextCategorySelection: null });
    } catch (nextError: any) {
      setError(nextError?.message || "Failed to delete category");
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

  return (
    <AdminLayout
      title="Command Admin — Library / Prompts"
      sectionLabel="Library"
      loggedInAs={principal}
      role={role}
      brands={brands}
      active="library"
    >
      <AdminCard
        title="Prompts"
        description="Brand-scoped prompt and category management. This is the first extracted library slice in command."
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button type="button" onClick={() => void loadData()} disabled={loading} style={secondaryButtonStyle}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button type="button" onClick={startNewPrompt} style={primaryButtonStyle}>
              Add Prompt
            </button>
          </div>
        }
      >
        <div style={{ display: "grid", gap: "18px" }}>
          <div
            style={{
              display: "grid",
              gap: "12px",
              gridTemplateColumns: "minmax(0, 1.2fr) repeat(3, minmax(180px, 0.7fr)) auto",
            }}
          >
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onBlur={() => void applyFilters({ search })}
              placeholder="Search prompts…"
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
              <option value="ALL">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <div style={countStyle}>{prompts.length} loaded</div>
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
              <div style={listHeaderStyle}>Prompt Directory</div>
              <div style={{ display: "grid", gap: "10px" }}>
                {prompts.map((prompt) => {
                  const active = selectedPromptId === prompt.id;
                  return (
                    <button
                      key={prompt.id}
                      type="button"
                      onClick={() => selectPrompt(prompt)}
                      style={{
                        ...listItemStyle,
                        ...(active ? listItemActiveStyle : null),
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "8px", alignItems: "flex-start" }}>
                        <div style={{ fontWeight: 700, color: "#0f172a", textAlign: "left" }}>{prompt.title}</div>
                        <StatusPill status={prompt.status} />
                      </div>
                      <div style={{ marginTop: "6px", color: "#64748b", textAlign: "left", fontSize: "0.84rem" }}>
                        {prompt.brandName || "Unknown brand"}
                        {prompt.categoryName ? ` • ${prompt.categoryName}` : ""}
                      </div>
                      <div style={{ marginTop: "8px", color: "#64748b", textAlign: "left", fontSize: "0.8rem" }}>
                        Updated {formatDate(prompt.updatedAt)}
                      </div>
                    </button>
                  );
                })}

                {!prompts.length ? <div style={emptyStateStyle}>No prompts found for the current filters.</div> : null}
              </div>
            </div>

            <div style={editorPanelStyle}>
              <div style={editorHeaderRowStyle}>
                <div>
                  <div style={editorTitleStyle}>
                    {selectedPromptId === NEW_PROMPT_ID || !selectedPrompt ? "New Prompt" : selectedPrompt.title}
                  </div>
                  <div style={editorMetaStyle}>
                    {selectedPrompt
                      ? `Created ${formatDate(selectedPrompt.createdAt)} • Updated ${formatDate(selectedPrompt.updatedAt)}`
                      : "Create a new prompt for a selected brand."}
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                  {selectedPrompt ? (
                    <button
                      type="button"
                      onClick={deletePrompt}
                      disabled={busyPromptAction === "delete"}
                      style={dangerButtonStyle}
                    >
                      {busyPromptAction === "delete" ? "Deleting…" : "Delete Prompt"}
                    </button>
                  ) : null}
                  <button type="button" onClick={savePrompt} disabled={savingPrompt} style={primaryButtonStyle}>
                    {savingPrompt ? "Saving…" : selectedPrompt ? "Save Prompt" : "Create Prompt"}
                  </button>
                </div>
              </div>

              {promptForm ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  <div style={formGridStyle}>
                    <label style={fieldLabelStyle}>
                      <span>Title</span>
                      <input
                        value={promptForm.title}
                        onChange={(event) => setPromptForm((current) => (current ? { ...current, title: event.target.value } : current))}
                        style={inputStyle}
                      />
                    </label>

                    <label style={fieldLabelStyle}>
                      <span>Status</span>
                      <select
                        value={promptForm.status}
                        onChange={(event) =>
                          setPromptForm((current) =>
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
                        value={promptForm.brandId}
                        onChange={(event) =>
                          setPromptForm((current) =>
                            current
                              ? {
                                  ...current,
                                  brandId: event.target.value,
                                  categoryId:
                                    categoryOptionsForPrompt.some((category) => category.id === current.categoryId)
                                      ? current.categoryId
                                      : "",
                                }
                              : current
                          )
                        }
                        disabled={Boolean(selectedPrompt)}
                        style={selectedPrompt ? disabledInputStyle : inputStyle}
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
                      <span>Category</span>
                      <select
                        value={promptForm.categoryId}
                        onChange={(event) =>
                          setPromptForm((current) => (current ? { ...current, categoryId: event.target.value } : current))
                        }
                        style={inputStyle}
                      >
                        <option value="">Uncategorized</option>
                        {categoryOptionsForPrompt.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label style={fieldLabelStyle}>
                    <span>Description</span>
                    <textarea
                      value={promptForm.description}
                      onChange={(event) =>
                        setPromptForm((current) => (current ? { ...current, description: event.target.value } : current))
                      }
                      rows={3}
                      style={textareaStyle}
                    />
                  </label>

                  <label style={fieldLabelStyle}>
                    <span>Content</span>
                    <textarea
                      value={promptForm.content}
                      onChange={(event) =>
                        setPromptForm((current) => (current ? { ...current, content: event.target.value } : current))
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
        title="Categories"
        description="Prompt category names and slugs are unique within each brand. Same-named categories across different brands are now supported."
        actions={
          <button type="button" onClick={startNewCategory} style={primaryButtonStyle}>
            Add Category
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
            <div style={listHeaderStyle}>Category Directory</div>
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
                      {category.brandName || "Unknown brand"} • {category.promptCount} prompt{category.promptCount === 1 ? "" : "s"}
                    </div>
                  </button>
                );
              })}

              {!categories.length ? <div style={emptyStateStyle}>No categories found for the current brand scope.</div> : null}
            </div>
          </div>

          <div style={editorPanelStyle}>
            <div style={editorHeaderRowStyle}>
              <div>
                <div style={editorTitleStyle}>
                  {selectedCategoryId === NEW_CATEGORY_ID || !selectedCategory ? "New Category" : selectedCategory.name}
                </div>
                <div style={editorMetaStyle}>
                  {selectedCategory
                    ? `${selectedCategory.promptCount} prompt${selectedCategory.promptCount === 1 ? "" : "s"} • Created ${formatDate(selectedCategory.createdAt)}`
                    : "Create a prompt category for a selected brand."}
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

export const getServerSideProps: GetServerSideProps<PromptsPageProps> = async (ctx) => {
  const auth = await requireBackofficePage(ctx, { callbackUrl: "/admin/library/prompts" });
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
  borderRadius: "999px",
  padding: "6px 10px",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
};

const promptStatusToneStyles = {
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
  borderRadius: "16px",
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
  borderRadius: "999px",
  border: "1px solid #b91c1c",
  background: "#b91c1c",
  color: "#ffffff",
  padding: "10px 14px",
  fontSize: "0.92rem",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryButtonStyle: CSSProperties = {
  borderRadius: "999px",
  border: "1px solid rgba(148,163,184,0.34)",
  background: "rgba(255,255,255,0.95)",
  color: "#0f172a",
  padding: "10px 14px",
  fontSize: "0.9rem",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerButtonStyle: CSSProperties = {
  borderRadius: "999px",
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
  borderRadius: "20px",
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
  borderRadius: "16px",
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
  borderRadius: "20px",
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
  borderRadius: "16px",
  border: "1px dashed rgba(148,163,184,0.34)",
  background: "rgba(255,255,255,0.88)",
  padding: "16px",
  color: "#64748b",
  fontSize: "0.92rem",
  lineHeight: 1.6,
};

const errorStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(254,242,242,0.94)",
  color: "#991b1b",
  padding: "14px 16px",
  fontSize: "0.95rem",
};

const noticeStyle: CSSProperties = {
  borderRadius: "18px",
  border: "1px solid rgba(34,197,94,0.22)",
  background: "rgba(240,253,244,0.95)",
  color: "#166534",
  padding: "14px 16px",
  fontSize: "0.95rem",
};

const metaNoteStyle: CSSProperties = {
  borderRadius: "14px",
  border: "1px solid rgba(148,163,184,0.24)",
  background: "rgba(248,250,252,0.95)",
  padding: "12px 14px",
  color: "#475569",
  fontSize: "0.9rem",
};
