import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UrlSearchInput, UrlSelect } from "@/components/url-controls";
import { cn } from "@/lib/utils";

export type SearchParams = Record<string, string | string[] | undefined>;

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Enables sorting on this column. */
  sort?: (row: T) => string | number | null;
  className?: string;
  /** Hide on narrow screens to keep tables readable on phones. */
  hideBelow?: "sm" | "md" | "lg";
  align?: "left" | "right" | "center";
};

export type Filter<T> = {
  param: string;
  label: string;
  options: { value: string; label: string }[];
  match: (row: T, value: string) => boolean;
};

const hideClass = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };

function str(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function hrefWith(params: SearchParams, updates: Record<string, string | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    const s = str(v);
    if (s !== undefined && s !== "") q.set(k, s);
  }
  for (const [k, v] of Object.entries(updates)) {
    if (v === null || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  return s ? `?${s}` : "?";
}

/**
 * Server-rendered table with URL-driven search, filters, sorting and
 * pagination (so state survives reloads and can be shared as a link).
 * Suitable for lists up to a few thousand rows; larger lists should be
 * paginated in SQL and passed with `total`.
 */
export function DataTable<T>({
  rows,
  columns,
  searchParams,
  rowKey,
  search,
  filters = [],
  pageSize = 20,
  defaultSort,
  empty,
  toolbar,
  paramPrefix = "",
  caption,
}: {
  rows: T[];
  columns: Column<T>[];
  searchParams: SearchParams;
  rowKey: (row: T) => string;
  search?: { placeholder: string; text: (row: T) => string };
  filters?: Filter<T>[];
  pageSize?: number;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  empty?: { title: string; description?: string; action?: React.ReactNode };
  toolbar?: React.ReactNode;
  /** Lets two tables on one page keep separate URL state. */
  paramPrefix?: string;
  caption?: string;
}) {
  const p = (name: string) => `${paramPrefix}${name}`;
  const query = (str(searchParams[p("q")]) ?? "").trim().toLowerCase();
  let filtered = rows;
  if (search && query) filtered = filtered.filter((r) => search.text(r).toLowerCase().includes(query));
  for (const f of filters) {
    const v = str(searchParams[p(f.param)]);
    if (v) filtered = filtered.filter((r) => f.match(r, v));
  }

  const sortKey = str(searchParams[p("sort")]) ?? defaultSort?.key;
  const sortDir = (str(searchParams[p("dir")]) ?? defaultSort?.dir ?? "asc") === "desc" ? "desc" : "asc";
  const sortCol = columns.find((c) => c.key === sortKey && c.sort);
  if (sortCol?.sort) {
    const getter = sortCol.sort;
    filtered = [...filtered].sort((a, b) => {
      const av = getter(a);
      const bv = getter(b);
      if (av === bv) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), "en-IN", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Number(str(searchParams[p("page")]) ?? 1) || 1));
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const hasControls = search || filters.length > 0 || toolbar;

  return (
    <div className="space-y-3">
      {hasControls && (
        <div className="no-print flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {search && <UrlSearchInput param={p("q")} placeholder={search.placeholder} resetParam={p("page")} />}
          {filters.map((f) => (
            <UrlSelect key={f.param} param={p(f.param)} label={f.label} options={f.options} resetParam={p("page")} />
          ))}
          {toolbar && <div className="flex flex-wrap gap-2 sm:ml-auto">{toolbar}</div>}
        </div>
      )}

      {rows.length === 0 && empty ? (
        <EmptyState title={empty.title} description={empty.description} action={empty.action} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <Table>
              {caption && <caption className="sr-only">{caption}</caption>}
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  {columns.map((c) => {
                    const active = sortCol?.key === c.key;
                    return (
                      <TableHead
                        key={c.key}
                        className={cn(c.hideBelow && hideClass[c.hideBelow], c.align === "right" && "text-right", c.align === "center" && "text-center", c.className)}
                        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                      >
                        {c.sort ? (
                          <Link
                            scroll={false}
                            href={hrefWith(searchParams, {
                              [p("sort")]: c.key,
                              [p("dir")]: active && sortDir === "asc" ? "desc" : "asc",
                              [p("page")]: null,
                            })}
                            className="inline-flex items-center gap-1 hover:text-foreground"
                          >
                            {c.header}
                            {active ? (
                              sortDir === "asc" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />
                            ) : (
                              <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                            )}
                          </Link>
                        ) : (
                          c.header
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="py-10 text-center text-sm text-muted-foreground">
                      No results match your search or filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  visible.map((row) => (
                    <TableRow key={rowKey(row)}>
                      {columns.map((c) => (
                        <TableCell
                          key={c.key}
                          className={cn(c.hideBelow && hideClass[c.hideBelow], c.align === "right" && "text-right tabular", c.align === "center" && "text-center", c.className)}
                        >
                          {c.cell(row)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {total > pageSize && (
            <nav className="no-print flex items-center justify-between border-t px-4 py-2 text-sm" aria-label="Pagination">
              <span className="text-muted-foreground tabular">
                {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
              </span>
              <div className="flex items-center gap-1">
                <PageLink disabled={page <= 1} href={hrefWith(searchParams, { [p("page")]: String(page - 1) })} label="Previous page">
                  <ChevronLeft className="size-4" />
                </PageLink>
                <span className="px-2 tabular">
                  {page} / {pages}
                </span>
                <PageLink disabled={page >= pages} href={hrefWith(searchParams, { [p("page")]: String(page + 1) })} label="Next page">
                  <ChevronRight className="size-4" />
                </PageLink>
              </div>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}

function PageLink({ href, disabled, label, children }: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span aria-disabled className="flex size-8 items-center justify-center rounded-md text-muted-foreground/40">
        {children}
      </span>
    );
  }
  return (
    <Link scroll={false} href={href} aria-label={label} className="flex size-8 items-center justify-center rounded-md hover:bg-muted">
      {children}
    </Link>
  );
}
