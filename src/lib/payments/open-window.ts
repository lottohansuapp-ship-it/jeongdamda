import { PORTONE_STORE_ID } from "./config";
import type { PaymentMethod } from "./methods";
import { vbankDueDate } from "./vbank";
import { STORE_INFO } from "../store-info";

/**
 * 결제창 여는 일을 한 곳에 둔다. 주문서와 주문 화면(다시 결제하기)이 같이 쓴다.
 *
 * 따로 두면 한쪽만 고쳐진다 — KCP 가 휴대폰 간편결제에 요구하는 site_name 이
 * 빠져서 결제창이 안 떴던 것도, 그런 값 하나가 조용히 빠진 경우였다.
 */
/**
 * 포트원 결제창.
 *
 * SDK 는 결제가 켜져 있을 때만 불러온다. 꺼져 있으면 번들에 실리지 않는다.
 *
 * 모바일에서는 결제 앱으로 넘어갔다가 redirectUrl 로 돌아오기 때문에 이 함수가
 * 값을 돌려주지 못할 수도 있다. 그 경우는 웹훅이 처리하고, 주문 화면이
 * 스스로 갱신되면서 결제 완료로 바뀐다.
 */
export async function openPaymentWindow(input: {
  /** 손님이 고른 수단. 채널키가 여기 붙어 있다. */
  method: PaymentMethod | null;
  paymentId: string;
  amount: number;
  orderName: string;
  customerName: string;
  customerPhone: string;
  /** KCP 가 요구하는 가맹점 회원 식별자. 휴대폰 소액결제 한도 관리에 쓴다. */
  shopUserId: string;
  redirectUrl: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!input.method) {
    return { ok: false, error: "결제 수단이 연결되지 않았어요." };
  }

  try {
    const PortOne = await import("@portone/browser-sdk/v2");

    const response = await PortOne.requestPayment({
      storeId: PORTONE_STORE_ID,
      channelKey: input.method.channelKey,
      paymentId: input.paymentId,
      orderName: input.orderName,
      totalAmount: input.amount,
      // SDK 가 받는 값은 "KRW" 다. 서버 API 문서의 CURRENCY_KRW 와 다르다 —
      // as never 로 덮어 두는 바람에 타입 검사도 못 잡았고, 결제창을 실제로
      // 여는 순간에야 터질 자리였다. 캐스팅을 빼서 컴파일러가 보게 둔다.
      currency: "KRW",
      payMethod: input.method.payMethod,
      /*
        간편결제는 어느 앱을 열지 알려 준다. 안 알려 주면 KCP 가 간편결제 고르는
        화면을 한 번 더 띄운다 — 손님은 방금 「카카오페이」 를 눌렀는데 또 묻는 셈이다.
        계좌이체는 KCP 결제창이 은행을 고르게 하므로 더 넘길 값이 없다.
      */
      ...(input.method.easyPayProvider
        ? { easyPay: { easyPayProvider: input.method.easyPayProvider } }
        : {}),
      ...(input.method.payMethod === "TRANSFER" ? { transfer: {} } : {}),
      /*
        가상계좌는 입금 기한을 30분으로 건다(사용자 결정). 기본값(PG 마다 며칠)으로 두면
        재고가 풀린 뒤에도 계좌가 열려 있어 늦은 입금이 들어온다. KCP 가 실제로 정한
        기한은 발급 뒤 서버가 다시 조회해 그 값을 쓴다(confirm.ts, 45분 상한).
      */
      ...(input.method.payMethod === "VIRTUAL_ACCOUNT"
        ? { virtualAccount: { accountExpiry: { dueDate: vbankDueDate(new Date()) } } }
        : {}),
      customer: {
        fullName: input.customerName,
        phoneNumber: input.customerPhone,
      },
      /*
        NHN KCP 는 shop_user_id 를 요구한다. 휴대폰 소액결제와 상품권에서는
        **필수**다 (SDK 타입에도 물음표가 없다). 없으면 결제창이 열리다 만다.

        카드에는 없어도 되지만 늘 보낸다 — 수단마다 다르게 보내면 휴대폰
        결제를 켜는 날 이 줄을 빼먹는다. 다른 PG 는 이 값을 무시한다.

        손님의 회원 id 다. 개인정보가 아니라 우리가 만든 식별자다.
      */
      bypass: {
        kcp_v2: {
          shop_user_id: input.shopUserId,
          /*
            결제창에 보일 상호. KCP 는 **휴대폰에서 간편결제·계좌이체를 부를 때 필수**다
            (포트원 KCP V2 문서). 빠져 있어서 휴대폰에서 카카오페이·네이버페이·
            계좌이체를 누르면 결제창이 아예 안 떴다. 카드는 없어도 열려서 몰랐다.
            사업자등록증 상호를 쓴다 — PG 심사가 등록증과 대조한다.
          */
          site_name: STORE_INFO.name,
        },
      },
      redirectUrl: input.redirectUrl,
    });

    // code 가 있으면 실패다. 손님이 창을 닫은 경우도 여기로 온다.
    if (response?.code) {
      const detail = failureDetail(response);
      return { ok: false, error: detail || "결제가 취소되었어요." };
    }
    return { ok: true };
  } catch (thrown) {
    /*
      포트원이 요청을 거절하면 응답 대신 예외가 온다(예: 이 채널이 가상계좌를 못 받음,
      입금 기한 형식이 틀림). 예전엔 그 이유를 버려서 "결제창을 열지 못했어요" 만 남았고,
      KCP 승인 문제인지 우리 값 문제인지 가릴 수 없었다. 이유를 함께 보여 준다.
    */
    const detail = failureDetail(thrown);
    return {
      ok: false,
      error: detail
        ? `결제창을 열지 못했어요. (${detail})`
        : "결제창을 열지 못했어요. 잠시 후 다시 시도해 주세요.",
    };
  }
}

/**
 * 포트원·KCP 가 준 실패 정보를 한 줄로. 설명(message)이 비어 오는 경우가 있어서
 * 오류 코드(code)와 KCP 코드·문구(pgCode·pgMessage)까지 모은다 — 무엇이 거절했는지
 * 가리려면 코드가 문장보다 확실하다.
 */
function failureDetail(source: unknown): string {
  if (source == null) return "";
  if (typeof source !== "object") return String(source);
  const e = source as { code?: unknown; message?: unknown; pgCode?: unknown; pgMessage?: unknown };
  const parts = [e.pgMessage || e.message, e.pgCode, e.code]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "");
  return [...new Set(parts)].join(" · ");
}

/** 결제창에 보일 주문 이름. "고추잎무침 외 2건" */
export function orderNameFrom(names: string[]): string {
  const first = names[0] ?? "반찬";
  const rest = names.length - 1;
  return rest > 0 ? `${first} 외 ${rest}건` : first;
}
