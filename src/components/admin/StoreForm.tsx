"use client";

import { useEffect, useState } from "react";
import {
  deleteDeliveryArea,
  saveDeliveryArea,
  updateStoreSettings,
} from "@/lib/store-actions";
import { formatPrice } from "@/lib/format";
import type { OpenState } from "@/lib/store";
import type { DeliveryArea, StoreSettings } from "@/types/database";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const FIELD =
  "h-12 w-full rounded-card border border-line bg-canvas px-4 text-[15px] placeholder:text-ink-faint focus:border-olive focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-olive";

const CLOSED_TEXT = {
  holiday: "임시 휴무 중이에요",
  weekday_off: "오늘은 정기 휴무예요",
  before_open: "아직 영업 시작 전이에요",
  after_close: "오늘 영업이 끝났어요",
} as const;

interface StoreFormProps {
  settings: StoreSettings;
  areas: DeliveryArea[];
  /**
   * 영업 여부는 서버가 계산해서 내려준다.
   * 주문을 받을지 말지 정하는 게 서버이므로, 손님·사장님 기기 시계를 믿으면 안 된다.
   */
  openState: OpenState;
}

export function StoreForm({ settings, areas, openState }: StoreFormProps) {
  const [toast, setToast] = useState<{
    tone: "error" | "notice";
    text: string;
  } | null>(null);
  const [editing, setEditing] = useState<DeliveryArea | "new" | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const notice = (text: string) => setToast({ tone: "notice", text });
  const fail = (text: string) => setToast({ tone: "error", text });

  return (
    <div className="pb-24">
      <section
        className="rounded-card bg-white p-5 shadow-soft"
        aria-labelledby="hours-heading"
      >
        <div className="flex items-baseline justify-between pb-4">
          <h2 id="hours-heading" className="text-[16px]">
            영업 설정
          </h2>
          <span
            className={`text-[12.5px] ${openState.open ? "text-success-deep" : "text-danger"}`}
          >
            {openState.open
              ? "지금 주문 받는 중"
              : CLOSED_TEXT[openState.reason ?? "holiday"]}
          </span>
        </div>

        <form
          action={async (formData) => {
            const result = await updateStoreSettings(formData);
            if (result.ok) notice("매장 설정을 저장했어요");
            else fail(result.error);
          }}
          className="space-y-3"
        >
          <Switch
            name="is_open"
            defaultChecked={settings.is_open}
            label="오늘 주문 받기"
            hint="끄면 손님 화면에 임시 휴무로 표시돼요"
          />

          <div className="grid grid-cols-2 gap-2.5">
            <TimeSelect
              name="open_time"
              label="영업 시작"
              value={settings.open_time}
            />
            <TimeSelect
              name="close_time"
              label="영업 마감"
              value={settings.close_time}
            />
          </div>
          <p className="text-[12px] leading-relaxed text-ink-faint">
            24시간 표기예요. 시작과 마감을 같게 두면 24시간 영업으로 처리됩니다.
          </p>

          <fieldset>
            <legend className="pb-1.5 text-[12px] text-ink-faint">
              정기 휴무
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((label, day) => (
                <label key={label} className="cursor-pointer">
                  <input
                    type="checkbox"
                    name="closed_weekdays"
                    value={day}
                    defaultChecked={settings.closed_weekdays.includes(day)}
                    className="peer sr-only"
                  />
                  <span className="grid h-11 w-11 place-items-center rounded-full border border-line text-[14px] text-ink-soft transition-colors duration-200 peer-checked:border-danger peer-checked:bg-danger/8 peer-checked:text-danger">
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <Switch
              name="pickup_enabled"
              defaultChecked={settings.pickup_enabled}
              label="픽업"
            />
            <Switch
              name="delivery_enabled"
              defaultChecked={settings.delivery_enabled}
              label="배달"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Labeled label="배달 최소주문 (원)">
              <input
                type="number"
                name="min_order_amount"
                min={0}
                step={1000}
                defaultValue={settings.min_order_amount}
                className={FIELD}
              />
            </Labeled>
            <Labeled label="배달비 (원)">
              <input
                type="number"
                name="delivery_fee"
                min={0}
                step={500}
                defaultValue={settings.delivery_fee}
                className={FIELD}
              />
            </Labeled>
          </div>

          <Switch
            name="restrict_delivery_area"
            defaultChecked={settings.restrict_delivery_area}
            label="배달 지역 제한"
            hint="끄면 어느 주소든 배달합니다. 켜면 아래 등록한 지역만 가능해요"
          />

          <div className="grid grid-cols-2 gap-2.5">
            <Labeled label="준비 시간 (분)">
              <input
                type="number"
                name="pickup_lead_minutes"
                min={0}
                step={10}
                defaultValue={settings.pickup_lead_minutes}
                className={FIELD}
              />
            </Labeled>
          </div>

          <Labeled label="공지 한 줄">
            <input
              name="notice"
              defaultValue={settings.notice ?? ""}
              placeholder="예) 오늘은 김치가 일찍 나갔어요"
              className={FIELD}
            />
            <p className="pt-1.5 text-[12px] leading-relaxed text-ink-faint">
              손님 화면 맨 위와 주문서에 함께 표시됩니다. 비워 두면 안 보입니다.
            </p>
          </Labeled>

          <button
            type="submit"
            className="mt-2 h-12 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
          >
            저장
          </button>
        </form>
      </section>

      <section className="pt-4" aria-labelledby="areas-heading">
        <div className="flex items-center justify-between pb-3">
          <h2 id="areas-heading" className="text-[16px]">
            배달 지역
          </h2>
          {editing === null && (
            <button
              type="button"
              onClick={() => setEditing("new")}
              className="h-10 rounded-pill border border-line bg-white px-3.5 text-[13px] text-ink-soft transition-colors duration-200 hover:border-olive hover:text-olive-deep"
            >
              + 추가
            </button>
          )}
        </div>

        {editing !== null && (
          <AreaForm
            area={editing === "new" ? null : editing}
            defaultMinimum={settings.min_order_amount}
            onDone={(message) => {
              setEditing(null);
              if (message) notice(message);
            }}
            onError={fail}
          />
        )}

        {areas.length === 0 && editing === null ? (
          <p className="rounded-card bg-white px-6 py-12 text-center text-[13.5px] leading-relaxed text-ink-soft shadow-soft">
            등록된 배달 지역이 없어요.
            <br />
            지역을 추가해야 손님이 배달로 주문할 수 있습니다.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {areas.map((area) => (
              <li
                key={area.id}
                className="rounded-card bg-white p-4 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[15px]">{area.name}</span>
                      {!area.is_active && (
                        <span className="rounded-pill bg-line px-2 py-0.5 text-[11px] leading-none text-ink">
                          중지
                        </span>
                      )}
                    </div>
                    <p className="pt-1 text-[13px] text-ink-soft">
                      배달비 {formatPrice(area.fee)} · 최소{" "}
                      {formatPrice(area.min_amount ?? settings.min_order_amount)}
                      {area.min_amount === null && " (기본값)"}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditing(area)}
                      className="h-9 rounded-pill border border-line px-3 text-[13px] text-ink-soft"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`'${area.name}' 배달 지역을 삭제할까요?`))
                          return;
                        const result = await deleteDeliveryArea(area.id);
                        if (result.ok) notice("배달 지역을 삭제했어요");
                        else fail(result.error);
                      }}
                      className="h-9 rounded-pill border border-line px-3 text-[13px] text-ink-faint transition-colors duration-200 hover:border-danger hover:text-danger"
                    >
                      삭제
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {toast && (
        <div
          role="status"
          className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-[420px] rounded-card px-4 py-3.5 text-[13.5px] leading-relaxed text-white shadow-lift"
          style={{ background: toast.tone === "error" ? "#c9302c" : "#2f3330" }}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function AreaForm({
  area,
  defaultMinimum,
  onDone,
  onError,
}: {
  area: DeliveryArea | null;
  defaultMinimum: number;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  return (
    <form
      action={async (formData) => {
        const result = await saveDeliveryArea(formData);
        if (result.ok) onDone("배달 지역을 저장했어요");
        else onError(result.error);
      }}
      className="mb-3 space-y-2.5 rounded-card bg-white p-4 shadow-soft"
    >
      {area && <input type="hidden" name="id" value={area.id} />}

      <p className="text-[15px]">{area ? "지역 수정" : "새 배달 지역"}</p>

      <Labeled label="지역 이름 (주소에 포함되는 말)">
        <input
          name="name"
          required
          defaultValue={area?.name ?? ""}
          placeholder="예) 정담동"
          className={FIELD}
        />
      </Labeled>

      <div className="grid grid-cols-2 gap-2.5">
        <Labeled label="배달비 (원)">
          <input
            type="number"
            name="fee"
            min={0}
            step={500}
            defaultValue={area?.fee ?? 0}
            className={FIELD}
          />
        </Labeled>
        <Labeled label={`최소주문 (비우면 ${formatPrice(defaultMinimum)})`}>
          <input
            type="number"
            name="min_amount"
            min={0}
            step={1000}
            defaultValue={area?.min_amount ?? ""}
            placeholder="기본값 사용"
            className={FIELD}
          />
        </Labeled>
      </div>

      <input type="hidden" name="sort_order" value={area?.sort_order ?? 0} />

      <Switch
        name="is_active"
        defaultChecked={area?.is_active ?? true}
        label="이 지역 배달 받기"
      />

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          className="h-12 flex-1 rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep"
        >
          저장
        </button>
        <button
          type="button"
          onClick={() => onDone("")}
          className="h-12 rounded-card border border-line px-5 text-[14px] text-ink-soft"
        >
          취소
        </button>
      </div>
    </form>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "10", "20", "30", "40", "50", "59"];

/**
 * <input type="time"> 은 브라우저가 OS 언어를 따라 12시간제로 뜬다.
 * 사장님이 정오(오후 12:00)와 자정(오전 12:00)을 헷갈리면 하루 종일 가게가 닫힌다.
 * 선택 목록으로 두면 오전·오후가 아예 없다.
 */
function TimeSelect({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: string;
}) {
  const [hour, setHour] = useState(value.slice(0, 2));
  const [minute, setMinute] = useState(value.slice(3, 5));

  return (
    <div>
      <span className="block pb-1 text-[12px] text-ink-faint">{label}</span>
      <input type="hidden" name={name} value={`${hour}:${minute}`} />
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`${label} 시`}
          value={hour}
          onChange={(event) => setHour(event.target.value)}
          className={`${FIELD} px-2 text-center tabular-nums`}
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
        <span className="text-[15px] text-ink-faint">:</span>
        <select
          aria-label={`${label} 분`}
          value={minute}
          onChange={(event) => setMinute(event.target.value)}
          className={`${FIELD} px-2 text-center tabular-nums`}
        >
          {MINUTES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block pb-1 text-[12px] text-ink-faint">{label}</span>
      {children}
    </label>
  );
}

function Switch({
  name,
  defaultChecked,
  label,
  hint,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-card border border-line px-4 py-3">
      <span className="min-w-0">
        <span className="block text-[14px]">{label}</span>
        {hint && (
          <span className="block pt-0.5 text-[12px] text-ink-faint">{hint}</span>
        )}
      </span>
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="relative block h-7 w-12 shrink-0 rounded-pill bg-line transition-colors duration-200 after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:duration-200 peer-checked:bg-olive peer-checked:after:translate-x-5" />
    </label>
  );
}
