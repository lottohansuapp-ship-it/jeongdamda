"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createProduct, reorderProducts } from "@/lib/actions";
import { EMPTY_FILTERS, filterProducts } from "@/lib/filter";
import { signOut } from "@/lib/auth";
import { stockStatus } from "@/lib/stock";
import type { Category, ProductWithCategory } from "@/types/database";
import { AdminRow } from "./AdminRow";

const TOAST_MS = 2600;

const INPUT =
  "h-12 w-full rounded-card border border-line bg-canvas px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none";

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-11 shrink-0 rounded-pill px-4 text-[14px] transition-colors duration-200 ${
        active
          ? "bg-ink text-white"
          : "border border-line bg-white text-ink-soft hover:border-ink-faint"
      }`}
    >
      {children}
    </button>
  );
}

interface AdminBoardProps {
  categories: Category[];
  products: ProductWithCategory[];
}

interface Toast {
  tone: "error" | "notice";
  message: string;
}

export function AdminBoard({ categories, products }: AdminBoardProps) {
  const [order, setOrder] = useState(products);
  const [synced, setSynced] = useState(products);
  const [toast, setToast] = useState<Toast | null>(null);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState("");
  const [categorySlug, setCategorySlug] = useState<string | null>(null);

  const filtering = query.trim().length > 0 || categorySlug !== null;

  // 손님 화면과 같은 필터 로직을 쓴다. 두 벌로 두면 결과가 갈린다.
  const visible = useMemo(
    () =>
      filterProducts(order, { ...EMPTY_FILTERS, query, categorySlug }),
    [order, query, categorySlug],
  );

  // 서버가 새 목록을 내려주면 렌더 중에 맞춘다. effect 로 하면 한 프레임 어긋난다.
  if (synced !== products) {
    setSynced(products);
    setOrder(products);
  }

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  const summary = useMemo(() => {
    const selling = products.filter((p) => p.today_available);
    return {
      // 전체와 판매중이 다르다. 전체가 안 보이면 관리자 권한이 붙었는지 알 수 없다
      total: products.length,
      hidden: products.length - selling.length,
      selling: selling.length,
      soldOut: selling.filter((p) => stockStatus(p.today_stock).level === "out")
        .length,
      low: selling.filter((p) => stockStatus(p.today_stock).level === "low")
        .length,
    };
  }, [products]);

  const onError = (message: string) => setToast({ tone: "error", message });
  const onNotice = (message: string) => setToast({ tone: "notice", message });

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;

    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);

    const result = await reorderProducts(next.map((p) => p.id));
    if (result.ok) onNotice("순서 저장됨");
    else {
      setOrder(products);
      onError(result.error);
    }
  }

  async function onAdd(formData: FormData) {
    const result = await createProduct({
      name: String(formData.get("name") ?? ""),
      price: Number(formData.get("price") ?? 0),
      category_id: String(formData.get("category_id") ?? ""),
      today_stock: Number(formData.get("today_stock") ?? 0),
      badges: ["today"],
      sort_order: order.length + 1,
    });

    if (result.ok) {
      setAdding(false);
      onNotice("상품이 추가되었습니다");
    } else {
      onError(result.error);
    }
  }

  return (
    <div className="pb-24">
      <header className="flex items-start justify-between gap-3 pb-6 pt-10">
        <div>
          <p className="text-[14px] text-ink-soft">오늘의 반찬</p>
          <h1 className="pt-1.5 text-[26px] leading-tight">오늘 재고 관리</h1>
          <p className="pt-3 text-[13px] text-ink-soft">
            전체 {summary.total}가지 · 판매중 {summary.selling} · 숨김{" "}
            {summary.hidden}
          </p>
          <p className="pt-1 text-[13px] text-ink-soft">
            마감임박 {summary.low} · 품절 {summary.soldOut}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/store"
            className="flex h-11 items-center rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
          >
            매장 설정
          </Link>
          <form action={signOut}>
            <button
              type="submit"
              className="h-11 rounded-pill border border-line bg-white px-4 text-[13px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
            >
              로그아웃
            </button>
          </form>
        </div>
      </header>

      {adding ? (
        <form
          action={onAdd}
          className="mb-4 space-y-2.5 rounded-card bg-white p-4 shadow-soft"
        >
          <p className="text-[15px]">새 반찬 추가</p>
          <input name="name" required placeholder="상품명" className={INPUT} />
          <div className="grid grid-cols-2 gap-2.5">
            <input
              name="price"
              type="number"
              min={0}
              step={100}
              required
              placeholder="가격"
              className={INPUT}
            />
            <input
              name="today_stock"
              type="number"
              min={0}
              defaultValue={0}
              placeholder="오늘 재고"
              className={INPUT}
            />
          </div>
          <select name="category_id" required className={INPUT} defaultValue="">
            <option value="" disabled>
              카테고리 선택
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="h-12 flex-1 rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
            >
              추가하기
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="h-12 rounded-card border border-line px-5 text-[14px] text-ink-soft"
            >
              취소
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mb-4 h-12 w-full rounded-card border border-dashed border-line bg-white text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
        >
          + 새 반찬 추가
        </button>
      )}

      <div className="sticky top-0 z-20 -mx-5 mb-3 bg-canvas/92 px-5 pb-3 pt-2 backdrop-blur-md">
        <label className="relative block">
          <span className="sr-only">반찬 검색</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="반찬 이름으로 찾기"
            className="h-12 w-full rounded-pill border border-line bg-white px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus:outline-none"
          />
        </label>

        <div className="no-scrollbar -mx-5 mt-2.5 flex gap-2 overflow-x-auto px-5">
          <Chip active={categorySlug === null} onClick={() => setCategorySlug(null)}>
            전체
          </Chip>
          {categories.map((category) => (
            <Chip
              key={category.id}
              active={categorySlug === category.slug}
              onClick={() => setCategorySlug(category.slug)}
            >
              {category.name}
            </Chip>
          ))}
        </div>
      </div>

      {visible.length !== order.length && (
        <p className="pb-2 text-[12.5px] text-ink-faint">
          {visible.length}가지 표시 중 · 순서 변경은 전체 목록에서만 가능해요
        </p>
      )}

      {visible.length === 0 ? (
        <p className="rounded-card bg-white px-6 py-16 text-center text-[14px] text-ink-soft shadow-soft">
          {order.length === 0
            ? "아직 등록된 반찬이 없습니다."
            : "조건에 맞는 반찬이 없어요."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((product) => {
            const index = order.findIndex((p) => p.id === product.id);
            return (
            <AdminRow
              key={product.id}
              product={product}
              categories={categories}
              onError={onError}
              onNotice={onNotice}
                onMove={(direction) => move(index, direction)}
                isFirst={index === 0}
                isLast={index === order.length - 1}
                canMove={filtering === false}
              />
            );
          })}
        </ul>
      )}

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-[420px] rounded-card px-4 py-3.5 text-[13.5px] leading-relaxed text-white shadow-lift"
          style={{ background: toast.tone === "error" ? "#c9302c" : "#2f3330" }}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}
