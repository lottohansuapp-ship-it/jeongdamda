"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminNav } from "./AdminNav";
import {
  createCoupon,
  grantCoupon,
  setCouponActive,
  updateCoupon,
} from "@/lib/coupon-actions";
import { formatPrice } from "@/lib/format";
import type { AdminCoupon, CustomerRow } from "@/lib/queries";

const INPUT =
  "h-12 w-full rounded-card border border-line bg-canvas px-3.5 text-[15px] focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive";

const KIND_LABEL: Record<string, string> = {
  signup: "가입 시 자동",
  manual: "직접 발급",
};

export function CouponBoard({
  coupons,
  customers,
}: {
  coupons: AdminCoupon[];
  customers: CustomerRow[];
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  /** 지금 누구에게 보낼지 고르는 중인 쿠폰. null 이면 고르는 중이 아니다. */
  const [sending, setSending] = useState<AdminCoupon | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    if (!notice && !error) return;
    const id = setTimeout(() => {
      setNotice(null);
      setError(null);
    }, 3000);
    return () => clearTimeout(id);
  }, [notice, error]);

  async function toggle(coupon: AdminCoupon) {
    const result = await setCouponActive(coupon.id, !coupon.is_active);
    if (result.ok) {
      setNotice(coupon.is_active ? "껐어요" : "켰어요");
      // 서버 값을 다시 받아온다. 화면에서만 바뀌면 새로고침했을 때 되돌아간다.
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  async function patch(id: string, field: Record<string, number>) {
    const result = await updateCoupon(id, field);
    if (result.ok) {
      setNotice("저장됐어요");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  async function onAdd(formData: FormData) {
    const result = await createCoupon(formData);
    if (result.ok) {
      setAdding(false);
      setNotice("쿠폰이 만들어졌어요. 확인하고 켜 주세요");
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  async function send() {
    if (!sending) return;
    const result = await grantCoupon(sending.id, picked);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSending(null);
    setPicked([]);
    // 이미 받은 사람은 건너뛴다. 고른 수와 다를 수 있어 실제 간 수를 말한다.
    setNotice(`${result.data.granted}명에게 보냈어요`);
    router.refresh();
  }

  return (
    <div className="pb-24">
      <AdminNav current="/admin/coupons" title="쿠폰" />

      {(notice || error) && (
        <p
          role="status"
          className={`mb-3 rounded-card px-4 py-3 text-[13.5px] ${
            error ? "bg-danger/5 text-danger" : "bg-olive-soft text-olive-deep"
          }`}
        >
          {error ?? notice}
        </p>
      )}

      <ul className="space-y-2.5">
        {coupons.map((coupon) => (
          <li key={coupon.id} className="rounded-card bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px]">{coupon.name}</p>
                <p className="pt-0.5 text-[12.5px] text-ink-faint">
                  {KIND_LABEL[coupon.kind] ?? coupon.kind} · 발급{" "}
                  {coupon.issued}장 · 사용 {coupon.used}장
                </p>
              </div>

              <label className="flex shrink-0 cursor-pointer items-center gap-2">
                <span className="text-[12px] text-ink-faint">
                  {coupon.is_active ? "켜짐" : "꺼짐"}
                </span>
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={coupon.is_active}
                  onChange={() => void toggle(coupon)}
                />
                <span className="relative block h-7 w-12 rounded-pill bg-line transition-colors duration-200 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:duration-200 peer-checked:bg-olive peer-checked:after:translate-x-5 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-olive" />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3">
              <Field
                label="할인 (원)"
                value={coupon.discount}
                step={100}
                onSave={(v) => void patch(coupon.id, { discount: v })}
              />
              <Field
                label="최소주문 (원)"
                value={coupon.min_order}
                step={100}
                onSave={(v) => void patch(coupon.id, { min_order: v })}
              />
              <Field
                label="유효 (일)"
                value={coupon.valid_days}
                step={1}
                onSave={(v) => void patch(coupon.id, { valid_days: v })}
              />
            </div>

            {/* 가입 쿠폰은 가입할 때 저절로 나간다. 골라 보낼 일이 없다. */}
            {coupon.kind === "manual" && (
              <button
                type="button"
                disabled={!coupon.is_active}
                onClick={() => {
                  setSending(coupon);
                  setPicked([]);
                }}
                className="mt-3 h-11 w-full rounded-card border border-line text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep disabled:opacity-40"
              >
                {coupon.is_active ? "회원에게 보내기" : "켜야 보낼 수 있어요"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          action={onAdd}
          className="mt-4 space-y-2.5 rounded-card bg-white p-4 shadow-soft"
        >
          <p className="text-[15px]">새 쿠폰</p>
          <input name="name" required placeholder="쿠폰 이름" className={INPUT} />
          <div className="grid grid-cols-3 gap-2">
            <input
              name="discount"
              type="number"
              /*
                step 은 화살표가 얼마씩 움직이는가만 정하는 게 아니다.
                브라우저는 min 에서 step 씩 더한 값만 유효하다고 본다.
                min=100 step=1000 이면 100·1100·2100… 만 통과해서
                5000 을 넣으면 "4100 또는 5100" 이라고 막는다.
                100원 단위면 어떤 금액이든 통과한다.
              */
              min={100}
              step={100}
              required
              placeholder="할인"
              className={INPUT}
            />
            <input
              name="min_order"
              type="number"
              min={0}
              step={100}
              defaultValue={0}
              placeholder="최소주문"
              className={INPUT}
            />
            <input
              name="valid_days"
              type="number"
              min={1}
              defaultValue={30}
              placeholder="유효일수"
              className={INPUT}
            />
          </div>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            만들면 꺼진 상태로 놓입니다. 금액을 확인하고 켜 주세요. 켜야
            회원에게 보낼 수 있어요.
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="h-12 flex-1 rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
            >
              만들기
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
          className="mt-4 h-12 w-full rounded-card border border-dashed border-line text-[14px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
        >
          + 새 쿠폰 만들기
        </button>
      )}

      {sending && (
        <SendSheet
          coupon={sending}
          customers={customers}
          picked={picked}
          setPicked={setPicked}
          onClose={() => setSending(null)}
          onSend={() => void send()}
        />
      )}
    </div>
  );
}

function Field({
  label,
  value,
  step,
  onSave,
}: {
  label: string;
  value: number;
  step: number;
  onSave: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="block pb-1 text-[11.5px] text-ink-faint">{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        defaultValue={value}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onSave(Math.round(next));
        }}
        className="h-11 w-full rounded-[12px] border border-line bg-canvas px-3 text-[14px] tabular-nums focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive"
      />
    </label>
  );
}

/**
 * 누구에게 보낼지 고르는 화면.
 *
 * 이름과 전화 뒷자리만 보여준다. 목록에 전체 번호를 늘어놓으면 화면 캡처
 * 한 장에 손님 연락처가 통째로 담긴다 — 배달하려고 한 건을 보는 것과는 다르다.
 */
function SendSheet({
  coupon,
  customers,
  picked,
  setPicked,
  onClose,
  onSend,
}: {
  coupon: AdminCoupon;
  customers: CustomerRow[];
  picked: string[];
  setPicked: (next: string[]) => void;
  onClose: () => void;
  onSend: () => void;
}) {
  const [query, setQuery] = useState("");
  const visible = customers.filter((row) => {
    const q = query.trim();
    if (!q) return true;
    return (row.name ?? "").includes(q) || row.tail.includes(q);
  });

  const allPicked =
    visible.length > 0 && visible.every((row) => picked.includes(row.id));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas">
      <header className="border-b border-line px-5 pb-3 pt-6">
        <div className="mx-auto flex max-w-[560px] items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[16px]">{coupon.name}</p>
            <p className="pt-0.5 text-[12.5px] text-ink-faint">
              {formatPrice(coupon.discount)} 할인 · {picked.length}명 선택됨
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-11 shrink-0 rounded-pill px-3 text-[13px] text-ink-soft"
          >
            닫기
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-5 py-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="이름 또는 번호 뒷자리"
          className={INPUT}
        />

        <button
          type="button"
          onClick={() =>
            setPicked(
              allPicked
                ? picked.filter((id) => !visible.some((row) => row.id === id))
                : [...new Set([...picked, ...visible.map((row) => row.id)])],
            )
          }
          className="mt-2.5 h-10 w-full rounded-card border border-line text-[13px] text-ink-soft"
        >
          {allPicked
            ? "보이는 회원 선택 해제"
            : `보이는 회원 ${visible.length}명 모두 선택`}
        </button>

        <ul className="mt-2.5 space-y-1.5">
          {visible.map((row) => {
            const on = picked.includes(row.id);
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() =>
                    setPicked(
                      on
                        ? picked.filter((id) => id !== row.id)
                        : [...picked, row.id],
                    )
                  }
                  aria-pressed={on}
                  className={`tap-target flex w-full items-center justify-between gap-3 rounded-card border px-4 text-left transition-colors duration-200 ${
                    on ? "border-olive bg-olive-soft" : "border-line bg-white"
                  }`}
                >
                  <span className="py-2.5 text-[14.5px]">
                    {row.name ?? "이름 없음"}
                    <span className="pl-2 text-[12.5px] text-ink-faint">
                      ···{row.tail}
                    </span>
                  </span>
                  {on && (
                    <span aria-hidden className="text-[15px] text-olive-deep">
                      &#10003;
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {visible.length === 0 && (
          <p className="py-16 text-center text-[13.5px] text-ink-soft">
            찾으시는 회원이 없어요.
          </p>
        )}
      </div>

      <div className="border-t border-line bg-white px-5 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto max-w-[560px]">
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={onSend}
            className="tap-target w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-40"
          >
            {picked.length === 0
              ? "회원을 고르세요"
              : `${picked.length}명에게 보내기`}
          </button>
          <p className="pt-2 text-center text-[11.5px] text-ink-faint">
            이미 받은 회원은 건너뜁니다
          </p>
        </div>
      </div>
    </div>
  );
}
