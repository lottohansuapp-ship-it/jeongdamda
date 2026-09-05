"use client";

import { useEffect, useRef, useState } from "react";
import { deleteProduct, updateProduct, uploadPhoto } from "@/lib/actions";
import { shrinkPhoto } from "@/lib/image";
import { BADGES, canAddBadge, toggleBadge } from "@/lib/badges";
import { formatPrice } from "@/lib/format";
import { stockStatus } from "@/lib/stock";
import type { Category, ProductWithCategory } from "@/types/database";
import { ProductPhoto } from "@/components/shop/ProductPhoto";

const COMMIT_DELAY_MS = 500;

const TONE = {
  out: "text-danger",
  low: "text-clay-deep",
  plenty: "text-success-deep",
} as const;

interface AdminRowProps {
  product: ProductWithCategory;
  categories: Category[];
  onError: (message: string) => void;
  onNotice: (message: string) => void;
  onMove: (direction: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
  /** 검색·카테고리 필터 중에는 순서를 못 바꾼다. 보이는 순서와 실제 순서가 다르다. */
  canMove: boolean;
}

export function AdminRow({
  product,
  categories,
  onError,
  onNotice,
  onMove,
  isFirst,
  isLast,
  canMove,
}: AdminRowProps) {
  const [open, setOpen] = useState(false);
  const [stock, setStock] = useState(product.today_stock);
  const [badges, setBadges] = useState<string[]>(product.badges ?? []);
  const [available, setAvailable] = useState(product.today_available);
  const settled = useRef(product.today_stock);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 아직 서버에 못 보낸 값. null 이면 보낼 것이 없다. */
  const waiting = useRef<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "done">("idle");

  /**
   * 숫자를 고쳐 쓰는 동안의 입력 문자열. null 이면 편집 중이 아니다.
   *
   * 칸을 비우는 순간을 저장하면 안 된다. Number("") 는 NaN 이 아니라 **0** 이라
   * 예전 검사(Number.isFinite)를 그냥 통과했다. 지우고 다른 곳을 누르면
   * 재고가 0 이 된다 — 품절로 보이고 손님은 그 반찬을 못 산다.
   */
  const [draft, setDraft] = useState<string | null>(null);

  // 서버가 새 값을 내려주면 맞춘다. 렌더 중에 해야 한 프레임 어긋나지 않는다.
  const [syncedBadges, setSyncedBadges] = useState(product.badges);
  if (syncedBadges !== product.badges) {
    setSyncedBadges(product.badges);
    setBadges(product.badges ?? []);
  }
  const [syncedAvailable, setSyncedAvailable] = useState(product.today_available);
  if (syncedAvailable !== product.today_available) {
    setSyncedAvailable(product.today_available);
    setAvailable(product.today_available);
  }

  /**
   * 편집 중이 아닐 때만 서버 값을 반영한다. 입력 중에 덮어쓰면 손가락이 튕긴다.
   *
   * 의존성에 product.today_stock 만 둔다. draft 를 넣으면 칸에서 손을 떼는
   * 순간 이 효과가 다시 돌아 서버의 옛 값으로 되돌린다 — 방금 저장한 숫자가
   * 눈앞에서 사라진다. 서버 값이 실제로 바뀌었을 때만 맞추면 된다.
   */
  useEffect(() => {
    if (timer.current || waiting.current !== null) return;
    settled.current = product.today_stock;
    setStock(product.today_stock);
  }, [product.today_stock]);

  /**
   * 화면을 먼저 바꾸고 잠시 뒤 저장한다.
   * 연타하거나 숫자를 고쳐 쓰는 동안 매번 서버를 부르면 그만큼 밀린다.
   *
   * 다만 **그 잠시 안에 화면을 떠나도 저장은 되어야 한다.** 예전에는 언마운트
   * 정리에서 타이머를 그냥 지웠다. 그래서 사장님이 재고를 고치고 바로
   * 당겨서 새로고침하거나, 다른 탭으로 넘어가거나, 휴대폰 화면이 꺼지면
   * 그 변경이 조용히 사라졌다. 아무 표시가 없어서 저장된 줄 아신다.
   * PC 에서는 그 0.5초 안에 떠날 일이 드물어 안 드러났던 것이다.
   */
  function commitStock(next: number) {
    setStock(next);
    waiting.current = next;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flushRef.current(), COMMIT_DELAY_MS);
  }

  /**
   * 최신 저장 함수를 담아 둔다. 언마운트 정리가 옛 클로저를 부르면
   * 이미 지난 값을 저장하게 된다. 렌더 중에 ref 를 건드리면 안 되므로
   * 매 렌더 뒤에 갈아 끼운다 (의존성 배열 없음).
   */
  const flushRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    flushRef.current = async () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      const next = waiting.current;
      if (next === null) return;
      waiting.current = null;

      setSaveState("saving");
      const result = await updateProduct(product.id, { today_stock: next });
      if (result.ok) {
        settled.current = next;
        setSaveState("done");
      } else {
        setStock(settled.current);
        setSaveState("idle");
        onError(result.error);
      }
    };
  });

  /**
   * 화면을 떠나기 전에 보낸다.
   *
   *  · visibilitychange — 앱 전환, 화면 잠금
   *  · pagehide — 새로고침(당겨서 새로고침 포함), 뒤로 가기, 탭 닫기
   *  · 정리 함수 — 목록에서 이 줄이 사라질 때 (검색·필터)
   *
   * 페이지가 곧바로 죽으면 요청이 끊길 수도 있다. 그래서 이것만 믿지 않고
   * "저장 중…" 을 화면에 띄운다 — 떠나도 되는지 사장님이 보고 판단하신다.
   */
  useEffect(() => {
    const flush = () => void flushRef.current();
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  // "저장됨" 은 잠깐만 보여준다. 계속 남으면 다음 변경 때 헷갈린다.
  useEffect(() => {
    if (saveState !== "done") return;
    const id = setTimeout(() => setSaveState("idle"), 1500);
    return () => clearTimeout(id);
  }, [saveState]);

  function bump(delta: number) {
    commitStock(Math.max(0, stock + delta));
  }

  async function patch(
    field: Parameters<typeof updateProduct>[1],
    label: string,
  ) {
    const result = await updateProduct(product.id, field);
    if (result.ok) onNotice(`${product.name} · ${label} 저장됨`);
    else onError(result.error);
  }

  /**
   * 뱃지·판매 토글은 화면을 먼저 바꾸고 저장은 뒤에서 한다.
   * 서버 응답을 기다렸다가 바꾸면 58행 재조회가 끝날 때까지 버튼이 안 움직인다.
   */
  async function commitBadges(next: string[]) {
    setBadges(next);
    const result = await updateProduct(product.id, { badges: next });
    if (!result.ok) {
      setBadges(product.badges ?? []);
      onError(result.error);
    }
  }

  async function commitAvailable(next: boolean) {
    setAvailable(next);
    const result = await updateProduct(product.id, { today_available: next });
    if (!result.ok) {
      setAvailable(product.today_available);
      onError(result.error);
    }
  }

  async function onPhotoPicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // 휴대폰 사진은 3~5MB 다. 목록은 84px 썸네일로 쓰는데 원본을 그대로
    // 올리면 반찬 60가지에 300MB 가 쌓이고, 매장에서 올리는 사장님 데이터도
    // 그만큼 쓴다. 브라우저에서 줄여서 보낸다 — 실패하면 원본이 그대로 간다.
    onNotice(`${product.name} · 사진 올리는 중…`);
    const ready = await shrinkPhoto(file);

    const form = new FormData();
    form.set("photo", ready);
    const result = await uploadPhoto(product.id, form);
    event.target.value = "";

    if (result.ok) onNotice(`${product.name} · 사진 변경됨`);
    else onError(result.error);
  }

  async function onDelete() {
    if (!confirm(`'${product.name}' 을(를) 삭제할까요? 되돌릴 수 없습니다.`)) return;
    const result = await deleteProduct(product.id);
    if (!result.ok) onError(result.error);
  }

  const status = stockStatus(stock);

  return (
    <li className="rounded-card bg-white p-4 shadow-soft">
      <div className="flex gap-3.5">
        <div className="relative h-[76px] w-[76px] shrink-0 overflow-hidden rounded-[12px]">
          <ProductPhoto
            name={product.name}
            photoPath={product.photo_path}
            sizes="76px"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px]">{product.name}</p>
              <p className="pt-0.5 text-[12.5px] text-ink-faint">
                {product.category.name} · {formatPrice(product.price)}
              </p>
            </div>

            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <span className="text-[12px] text-ink-faint">판매</span>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={available}
                onChange={(event) => commitAvailable(event.target.checked)}
              />
              <span className="relative block h-7 w-12 rounded-pill bg-line transition-colors duration-200 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:duration-200 peer-checked:bg-olive peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-olive" />
            </label>
          </div>

          <div className="flex items-center gap-3 pt-3">
            <Step
              label="재고 1개 줄이기"
              onClick={() => bump(-1)}
              disabled={stock <= 0}
            >
              −
            </Step>
            {/* 아침에 30개를 채우려고 30번 누를 수는 없다. 숫자를 직접 고친다.
                +/− 는 남겨 둔다 — 한두 개 조정할 땐 그게 빠르다. */}
            <label className="flex items-baseline">
              <span className="sr-only">{product.name} 재고 수량</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={draft ?? String(stock)}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const raw = event.target.value;
                  setDraft(raw);

                  // 지우는 중이다. 아직 저장할 값이 아니다 — 여기서 저장하면
                  // 0 이 들어간다 (Number("") 는 0 이다).
                  if (raw.trim() === "") return;

                  const value = Number(raw);
                  if (!Number.isFinite(value)) return;
                  commitStock(Math.min(999, Math.max(0, Math.round(value))));
                }}
                // 지운 채로 떠나면 고치기 전 값으로 되돌린다. 빈 칸은 0 이 아니다.
                onBlur={() => setDraft(null)}
                className="w-[3.25rem] rounded-[8px] bg-transparent text-center text-[20px] tabular-nums tracking-tight outline-none focus:bg-olive-soft"
              />
              <span className="text-[12px] text-ink-faint">개</span>
            </label>
            <Step label="재고 1개 늘리기" onClick={() => bump(1)}>
              +
            </Step>
            {/* 손님 화면의 StockBadge 와 같은 표시. 이모지는 기기마다 다르게 그려진다 */}
            <span
              className={`inline-flex items-center gap-1.5 text-[12.5px] ${TONE[status.level]}`}
            >
              <span
                aria-hidden
                className="h-[7px] w-[7px] rounded-full bg-current"
              />
              {status.label}
            </span>

            {/*
              저장됐는지 보이게 한다. 예전에는 아무 표시가 없어서, 저장이
              사라져도 사장님은 끝난 줄 아셨다. role="status" 라 화면을
              못 보는 분께도 읽힌다.
            */}
            <span role="status" className="text-[12px] text-ink-faint">
              {saveState === "saving" && "저장 중…"}
              {saveState === "done" && (
                <span className="text-success-deep">저장됨</span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {BADGES.map((badge) => {
          const on = badges.includes(badge.key);
          return (
            <Flag
              key={badge.key}
              active={on}
              disabled={!on && !canAddBadge(badges)}
              onClick={() => commitBadges(toggleBadge(badges, badge.key))}
            >
              {badge.label}
            </Flag>
          );
        })}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="ml-auto h-9 rounded-pill border border-line px-3 text-[13px] text-ink-soft transition-colors duration-200 hover:border-ink-faint"
        >
          {open ? "접기" : "수정"}
        </button>
      </div>

      {!open ? null : (
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3.5 sm:grid-cols-4">
        <Field label="가격">
          <input
            type="number"
            min={0}
            step={100}
            defaultValue={product.price}
            onBlur={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value !== product.price) {
                patch({ price: Math.max(0, Math.round(value)) }, "가격");
              }
            }}
            className="h-11 w-full rounded-[12px] border border-line bg-canvas px-3 text-[14px] tabular-nums focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
          />
        </Field>

        <Field label="카테고리">
          <select
            value={product.category_id}
            onChange={(event) =>
              patch({ category_id: event.target.value }, "카테고리")
            }
            className="h-11 w-full rounded-[12px] border border-line bg-canvas px-2.5 text-[14px] focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="사진">
          <span className="tap-target flex h-11 w-full cursor-pointer items-center justify-center rounded-[12px] border border-dashed border-line bg-canvas text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep">
            변경
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              className="sr-only"
              onChange={onPhotoPicked}
            />
          </span>
        </Field>

        <Field label="순서">
          <div className="flex h-11 gap-2">
            <Move
              label="위로"
              onClick={() => onMove(-1)}
              disabled={isFirst || !canMove}
            >
              ↑
            </Move>
            <Move
              label="아래로"
              onClick={() => onMove(1)}
              disabled={isLast || !canMove}
            >
              ↓
            </Move>
          </div>
        </Field>

        {/* 한 줄을 다 쓴다. 위 넷은 숫자·버튼이라 좁아도 되지만 이건 글자다.
            지울 때는 null 로 넣어야 한다 — 빈 문자열은 값이 있는 걸로 쳐서
            손님 상세에 "원산지" 줄만 덩그러니 남는다. */}
        <div className="col-span-2 sm:col-span-4">
          <Field label="원산지">
            <input
              type="text"
              defaultValue={product.origin ?? ""}
              placeholder="국내산"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value === (product.origin ?? "")) return;
                patch({ origin: value || null }, "원산지");
              }}
              className="h-11 w-full rounded-[12px] border border-line bg-canvas px-3 text-[14px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
            />
          </Field>
        </div>

        <div className="col-span-2 flex justify-end sm:col-span-4">
          <button
            type="button"
            onClick={onDelete}
            className="h-9 rounded-pill px-3 text-[13px] text-ink-faint transition-colors duration-200 hover:text-danger"
          >
            삭제
          </button>
        </div>
      </div>
      )}
    </li>
  );
}

function Step({
  label,
  onClick,
  disabled = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="tap-target grid place-items-center rounded-full border border-line bg-canvas text-[20px] leading-none text-ink transition-[background-color,transform] duration-150 hover:bg-olive-soft active:scale-95 disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block pb-1 text-[11.5px] text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function Move({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex-1 rounded-[12px] border border-line bg-canvas text-[15px] transition-colors duration-200 hover:bg-olive-soft disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Flag({
  active,
  onClick,
  disabled = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? "뱃지는 2개까지 달 수 있어요" : undefined}
      className={`h-9 rounded-pill px-3 text-[13px] transition-colors duration-200 disabled:opacity-30 ${
        active
          ? "bg-olive-soft text-olive-deep"
          : "border border-line text-ink-faint hover:text-ink-soft"
      }`}
    >
      {children}
    </button>
  );
}
