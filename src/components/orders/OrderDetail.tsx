"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { isPaymentConfigured } from "@/lib/payments/config";
import { ReorderButton } from "./ReorderButton";
import { StatusPill } from "./StatusPill";
import { cancelOrder } from "@/lib/order-actions";
import {
  canCustomerCancel,
  formatClock,
  formatOrderTime,
  fulfillmentLabel,
  isSettled,
  progressIndex,
  progressSteps,
  statusMeta,
} from "@/lib/orders";
import { formatPrice } from "@/lib/format";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import type { OrderWithItems } from "@/types/database";

export function OrderDetail({ order }: { order: OrderWithItems }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // 사장님이 상태를 바꾸면 손님 화면에도 따라온다. 끝난 주문에서는 돌지 않는다.
  // 이 주문 하나만 구독한다 — 남의 주문 변경까지 받을 이유가 없다.
  useLiveRefresh({
    enabled: !isSettled(order.status),
    filter: `id=eq.${order.id}`,
  });

  const meta = statusMeta(order.status);
  const isDelivery = order.fulfillment === "delivery";
  const deadline =
    order.status === "pending_payment" ? formatClock(order.reserved_until) : "";

  function cancel() {
    if (!confirm("주문을 취소할까요? 담았던 재고는 매장으로 돌아가요.")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelOrder(order.id);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="pb-10">
      <section className="rounded-card bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-3">
          {/*
            사장님이 상태를 바꾸면 useLiveRefresh 가 이 화면을 다시 그린다.
            그런데 안내가 없어서, 픽업 시간에 맞춰 화면을 열어 둔 손님은
            "준비 완료" 로 바뀌어도 아무 소리를 못 들었다. 이 페이지의
            존재 이유가 바로 그 알림이라 status 영역으로 감싼다.
          */}
          <div role="status" className="min-w-0">
            <p className="text-[12.5px] text-ink-faint">
              주문번호 {order.order_no}
            </p>
            <p className="pt-1.5 text-[19px] leading-snug">{meta.label}</p>
            <p className="pt-1 text-[13.5px] leading-relaxed text-ink-soft">
              {meta.hint}
            </p>
          </div>
          <StatusPill status={order.status} />
        </div>

        {/*
          pending_payment 는 결제를 안 켠 지금만 나오는 상태가 아니다.
          결제를 켜도 나온다 — 모바일 간편결제는 리다이렉트 방식이라 손님이
          돈을 내고 이 화면에 도착했는데 웹훅이 아직 안 왔을 수 있다.
          그때 "결제 기능은 준비 중" 이 뜨면 방금 결제한 손님이 놀란다.
          켜는 날 고칠 코드를 남기지 않는다는 원칙(D16)에도 어긋난다.
        */}
        {order.status === "pending_payment" && (
          <div className="mt-4 rounded-[12px] bg-cream p-3.5">
            <p className="text-[13px] leading-relaxed">
              {isPaymentConfigured()
                ? "결제를 확인하고 있어요. 잠시만 기다려 주세요."
                : "결제 기능은 준비 중이에요. 지금은 주문만 접수된 상태예요."}
              {deadline && (
                <>
                  {" "}
                  <strong className="font-normal text-clay-deep">
                    {deadline}
                  </strong>{" "}
                  까지 결제되지 않으면 자동으로 취소되고 재고가 매장으로 돌아가요.
                </>
              )}
            </p>
          </div>
        )}

        {order.status === "canceled" && order.cancel_reason && (
          <p className="mt-4 text-[13px] text-ink-soft">
            사유 · {order.cancel_reason}
          </p>
        )}

        {progressIndex(order.status, order.fulfillment) >= 0 && (
          <Progress status={order.status} fulfillment={order.fulfillment} />
        )}
      </section>

      <Section title={isDelivery ? "배송 정보" : "픽업 정보"}>
        <Field label="수령 방법" value={fulfillmentLabel(order.fulfillment)} />
        {isDelivery ? (
          <Field label="배송지" value={order.address_snapshot ?? "-"} />
        ) : (
          <Field label="픽업 시간" value={formatOrderTime(order.pickup_at)} />
        )}
        <Field
          label="받는 분"
          value={`${order.receiver_name} · ${order.receiver_phone}`}
        />
        {order.memo && <Field label="요청사항" value={order.memo} />}
        <Field label="주문 일시" value={formatOrderTime(order.created_at)} />
      </Section>

      <Section title={`주문 상품 ${order.items.length}개`}>
        <ul className="space-y-2.5">
          {order.items.map((item) => (
            <li
              key={item.id}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="min-w-0 text-[14px]">
                {item.name}
                <span className="pl-1.5 text-[13px] text-ink-faint">
                  ×{item.quantity}
                </span>
              </span>
              <span className="shrink-0 text-[14px] tabular-nums">
                {formatPrice(item.line_total)}
              </span>
            </li>
          ))}
        </ul>

        <dl className="mt-4 space-y-1.5 border-t border-line pt-3.5 text-[13.5px]">
          <Row label="상품 금액" value={formatPrice(order.subtotal)} />
          {isDelivery && (
            <Row
              label="배달비"
              value={
                order.delivery_fee === 0 ? "무료" : formatPrice(order.delivery_fee)
              }
            />
          )}
          <div className="flex items-baseline justify-between pt-1.5">
            <dt className="text-[14px]">결제 금액</dt>
            <dd className="text-[18px] tabular-nums tracking-tight">
              {formatPrice(order.total)}
            </dd>
          </div>
        </dl>
      </Section>

      {error && (
        <p role="alert" className="py-3 text-[13px] text-danger">
          {error}
        </p>
      )}

      {/* 끝난 주문에서 가장 자주 하는 일이 "또 시키기" 다. 제일 눈에 띄는 자리에 둔다. */}
      {isSettled(order.status) && order.items.length > 0 && (
        <ReorderButton
          orderId={order.id}
          label="이 주문 그대로 다시 담기"
          className="tap-target mt-2.5 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-40"
        />
      )}

      <div className="pt-2.5">
        {canCustomerCancel(order.status) ? (
          <button
            type="button"
            disabled={pending}
            onClick={cancel}
            className="tap-target w-full rounded-card border border-line bg-white text-[14px] text-ink-soft transition-colors duration-200 hover:border-danger hover:text-danger disabled:opacity-40"
          >
            {pending ? "취소하는 중…" : "주문 취소"}
          </button>
        ) : (
          order.status !== "completed" &&
          order.status !== "canceled" && (
            <p className="text-center text-[13px] leading-relaxed text-ink-faint">
              이미 준비가 시작됐어요. 취소가 필요하면 매장에 연락해 주세요.
            </p>
          )
        )}
      </div>

      <div className="pt-6 text-center">
        <Link
          href="/orders"
          className="text-[13px] text-ink-faint underline underline-offset-4"
        >
          주문내역으로
        </Link>
      </div>
    </div>
  );
}

/** 어디까지 왔는지 한눈에. 지난 단계는 채우고 남은 단계는 비운다. */
function Progress({
  status,
  fulfillment,
}: {
  status: string;
  fulfillment: string;
}) {
  const steps = progressSteps(fulfillment);
  const current = progressIndex(status, fulfillment);

  return (
    <ol className="mt-5 flex gap-1.5">
      {steps.map((step, index) => (
        <li
          key={step}
          className="flex-1"
          aria-current={index === current ? "step" : undefined}
        >
          <span
            aria-hidden
            className={`block h-1 rounded-pill transition-colors duration-300 ${
              index <= current ? "bg-olive" : "bg-line"
            }`}
          />
          <span
            className={`block pt-1.5 text-center text-[12px] ${
              index <= current ? "text-olive-deep" : "text-ink-faint"
            }`}
          >
            {statusMeta(step).label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-2.5 rounded-card bg-white p-5 shadow-soft">
      <h2 className="pb-3.5 text-[13px] text-ink-faint">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 pb-2.5 last:pb-0">
      <span className="w-[68px] shrink-0 text-[13px] text-ink-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] leading-relaxed">
        {value}
      </span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
