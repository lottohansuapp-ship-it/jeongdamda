"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmIdentity } from "@/lib/identity-actions";
import {
  PORTONE_IDENTITY_CHANNEL_KEY,
  PORTONE_STORE_ID,
} from "@/lib/payments/config";

interface IdentityFormProps {
  next: string;
  userId: string;
  /** 휴대폰에서 인증 화면이 페이지를 넘겼다가 돌아오면 주소에 붙어 온다 */
  returned: { id: string | null; failed: boolean; agreed: boolean };
}

/**
 * 휴대폰 본인인증. 이름과 번호를 손님이 적지 않는다 — 통신사가 확인해 준
 * 값을 쓴다. 남의 번호를 먼저 적어 두는 일이 여기서 끝난다 (0027).
 *
 * PC 는 인증 창이 결과를 돌려주고, 휴대폰은 페이지를 넘겼다가 redirectUrl 로
 * 돌아온다. 두 길 모두 끝은 confirmIdentity 하나다. 결과는 서버가 포트원에
 * 다시 물어서 판단한다.
 */
export function IdentityForm({ next, userId, returned }: IdentityFormProps) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(returned.agreed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(
    returned.failed ? "본인인증이 취소됐어요. 다시 시도해 주세요." : null,
  );

  async function finish(identityVerificationId: string, consent: boolean) {
    const result = await confirmIdentity(identityVerificationId, consent).catch(
      () => ({ ok: false as const, error: "본인인증 결과를 확인하지 못했어요. 다시 시도해 주세요." }),
    );
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  // 휴대폰에서 돌아온 경우. 한 번만 확인한다.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !returned.id || returned.failed) return;
    handled.current = true;
    void confirmIdentity(returned.id, returned.agreed).then((result) => {
      if (result.ok) {
        router.replace(next);
        router.refresh();
      } else {
        setError(result.error);
      }
    }).catch(() => {
      // 인증 창에서 막 돌아온 직후 연결이 끊기면 여기로 온다. 버튼이
      // "확인하는 중" 에 갇히지 않게 오류를 띄워 다시 누를 수 있게 한다.
      setError("본인인증 결과를 확인하지 못했어요. 다시 시도해 주세요.");
    });
  }, [returned.id, returned.failed, returned.agreed, next, router]);

  async function start() {
    setError(null);
    if (!agreed) {
      setError("이용약관과 개인정보 수집·이용에 동의해 주세요.");
      return;
    }
    setPending(true);

    const identityVerificationId = `identity-${crypto.randomUUID()}`;
    const back = new URL("/signup/phone", window.location.origin);
    back.searchParams.set("next", next);
    back.searchParams.set("agreed", "1");

    try {
      const PortOne = await import("@portone/browser-sdk/v2");
      const response = await PortOne.requestIdentityVerification({
        storeId: PORTONE_STORE_ID,
        channelKey: PORTONE_IDENTITY_CHANNEL_KEY,
        identityVerificationId,
        // 서버가 "이 계정으로 시작한 인증인가" 를 맞춰 본다 (identity.ts)
        customData: userId,
        redirectUrl: back.toString(),
      });

      // 휴대폰은 여기까지 오지 않고 페이지가 넘어간다
      if (response?.code) {
        setError(response.message ?? "본인인증이 취소됐어요.");
        setPending(false);
        return;
      }
      await finish(identityVerificationId, true);
    } catch {
      setError("본인인증 창을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }

  const busy = pending || (Boolean(returned.id) && !returned.failed && !error);

  return (
    <div className="space-y-2.5 pt-8">
      {/* 카카오로 오신 분은 여기서 처음 동의한다 */}
      <label className="flex cursor-pointer gap-2.5 px-1">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(event) => setAgreed(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-olive"
        />
        <span className="text-[13px] leading-relaxed text-ink-soft">
          <Link href="/terms" target="_blank" className="text-ink underline underline-offset-4">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" target="_blank" className="text-ink underline underline-offset-4">
            개인정보 수집·이용
          </Link>
          에 동의합니다 <span className="text-clay-deep">(필수)</span>
        </span>
      </label>

      {error && (
        <p role="alert" className="px-1 pt-1 text-[13px] text-danger">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="mt-4 h-12 w-full rounded-card bg-olive text-[15px] text-white transition-colors duration-200 hover:bg-olive-deep disabled:opacity-50"
      >
        {busy ? "확인하는 중…" : "휴대폰으로 본인인증"}
      </button>

      <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-ink-faint">
        통신사 본인확인 창이 열려요. 이름과 휴대폰 번호는 인증된 정보로
        저장되고, 주민등록번호는 받지 않습니다.
      </p>
    </div>
  );
}
