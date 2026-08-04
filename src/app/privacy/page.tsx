import type { Metadata } from "next";
import { Article, Bullets, PolicyPage } from "@/components/ui/PolicyPage";
import { STORE_INFO } from "@/lib/store-info";

export const metadata: Metadata = {
  title: "개인정보처리방침",
  description: "수집하는 개인정보 항목과 이용 목적, 보유 기간을 안내합니다.",
};

/** 안 채운 값은 감추지 않는다. 감추면 다 갖춰진 것처럼 보인다. */
function value(text: string) {
  const trimmed = text.trim();
  return trimmed ? (
    <span className="text-ink">{trimmed}</span>
  ) : (
    <span className="text-danger">미등록</span>
  );
}

const TRUSTEES: [string, string][] = [
  ["Supabase", "회원 인증, 주문·회원 정보 보관, 상품 사진 보관"],
  ["Vercel", "서비스 호스팅과 접속 기록 처리"],
  ["포트원 및 계약 결제대행사", "결제 처리, 결제 취소와 환불"],
  ["알림 발송 대행사", "주문 상태 알림 발송"],
];

/**
 * 이 앱이 실제로 하는 일만 적는다.
 * 템플릿을 그대로 붙여 하지도 않는 처리를 적어두면 심사에서도 걸리고,
 * 나중에 사고가 났을 때 방침과 실제가 다른 것이 더 큰 문제가 된다.
 */
export default function PrivacyPage() {
  return (
    <PolicyPage title="개인정보처리방침" effectiveFrom="2026년 8월 4일">
      <Article heading="1. 수집하는 개인정보 항목">
        <p>매장은 서비스 제공에 필요한 최소한의 정보만 수집합니다.</p>
        <Bullets
          items={[
            "회원가입(이메일) — 이메일 주소, 비밀번호, 이름, 휴대폰번호",
            "회원가입(카카오) — 카카오 계정 이메일, 이름, 휴대폰번호",
            "주문 — 받는 분 이름과 연락처, 배송지(우편번호·주소·상세주소), 요청사항",
            "결제 — 결제 수단 종류, 결제 금액, 결제 식별번호",
            "자동 수집 — 접속 일시, 접속 기기 정보, 서비스 이용 기록",
          ]}
        />
        <p>
          비밀번호는 매장이 알아볼 수 없는 형태로 변환되어 저장되며 복원할 수
          없습니다.{" "}
          <strong className="font-normal text-ink">
            카드번호 등 결제 수단의 상세 정보는 결제대행사가 처리하며 매장은
            보관하지 않습니다.
          </strong>
        </p>
      </Article>

      <Article heading="2. 개인정보의 이용 목적">
        <Bullets
          items={[
            "회원 식별과 본인 확인, 회원제 서비스 제공",
            "주문 접수, 상품 준비, 픽업 및 배달",
            "결제 처리와 환불",
            "주문 상태 안내 및 문의 응대",
            "부정 이용 방지와 서비스 안정성 확보",
          ]}
        />
        <p>
          매장은 수집한 개인정보를 위 목적 외의 용도로 이용하지 않으며, 광고성
          정보를 보내려면 별도의 동의를 받습니다.
        </p>
      </Article>

      <Article heading="3. 보유 및 이용 기간">
        <p>
          회원 정보는 회원 탈퇴 시까지 보유하며 탈퇴 시 지체 없이 파기합니다.
          다만 다음 법령이 정한 기간 동안에는 해당 기록을 보존합니다.
        </p>
        <Bullets
          items={[
            "계약 또는 청약철회 등에 관한 기록 — 5년 (전자상거래법)",
            "대금결제 및 재화 등의 공급에 관한 기록 — 5년 (전자상거래법)",
            "소비자의 불만 또는 분쟁처리에 관한 기록 — 3년 (전자상거래법)",
            "표시·광고에 관한 기록 — 6개월 (전자상거래법)",
            "서비스 접속 기록 — 3개월 (통신비밀보호법)",
          ]}
        />
      </Article>

      <Article heading="4. 개인정보 처리의 위탁">
        <p>
          매장은 서비스 운영을 위해 아래와 같이 개인정보 처리 업무를 위탁하고
          있으며, 수탁자가 관련 법령을 지키도록 관리·감독합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-line text-left text-ink">
                <th className="py-2 pr-3 font-normal">수탁자</th>
                <th className="py-2 font-normal">위탁 업무</th>
              </tr>
            </thead>
            <tbody>
              {TRUSTEES.map(([who, what]) => (
                <tr key={who} className="border-b border-line align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-ink">{who}</td>
                  <td className="py-2">{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          개인정보는 {value(STORE_INFO.dataRegion)}에 위치한 서버에 보관·처리
          됩니다. 매장은 서비스 운영을 위한 위탁 외에 개인정보를 국외로 이전하는
          별도의 처리를 하지 않습니다.
        </p>
      </Article>

      <Article heading="5. 개인정보의 제3자 제공">
        <p>
          매장은 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에
          따라 수사기관이 적법한 절차로 요구하는 경우에는 예외로 합니다.
        </p>
      </Article>

      <Article heading="6. 이용자의 권리와 행사 방법">
        <p>
          이용자는 언제든지 본인의 개인정보에 대해 열람, 정정, 삭제, 처리정지를
          요구할 수 있습니다. 이름·연락처·배송지는 앱의 내 정보 화면에서 직접
          확인하고 고칠 수 있으며, 그 밖의 요청은 아래 연락처로 주시면 지체 없이
          처리합니다.
        </p>
        <p>만 14세 미만 아동의 개인정보는 수집하지 않습니다.</p>
      </Article>

      <Article heading="7. 개인정보의 파기">
        <p>
          보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이
          파기합니다. 전자적 파일은 복구할 수 없는 방법으로 삭제하고, 출력물은
          분쇄하거나 소각합니다.
        </p>
      </Article>

      <Article heading="8. 개인정보의 안전성 확보 조치">
        <Bullets
          items={[
            "비밀번호는 일방향 암호화하여 저장하며 매장도 확인할 수 없습니다.",
            "서비스와 이용자 사이의 모든 통신은 암호화(HTTPS)됩니다.",
            "데이터베이스에 접근 권한 정책을 적용하여, 이용자는 자신의 정보에만 접근할 수 있습니다.",
            "개인정보를 다루는 인원을 최소한으로 제한합니다.",
          ]}
        />
      </Article>

      <Article heading="9. 개인정보 보호책임자">
        <p>
          개인정보 처리에 관한 문의, 불만, 피해구제는 아래로 연락해 주시면
          답변해 드립니다.
        </p>
        <Bullets
          items={[
            <>보호책임자: {value(STORE_INFO.privacyOfficer)}</>,
            <>연락처: {value(STORE_INFO.phone)}</>,
            <>이메일: {value(STORE_INFO.email)}</>,
          ]}
        />
        <p>
          개인정보 침해에 대한 상담이 필요하시면 개인정보침해신고센터(국번없이
          118), 개인정보 분쟁조정위원회(1833-6972), 대검찰청 사이버수사과(1301),
          경찰청 사이버수사국(182)에 문의하실 수 있습니다.
        </p>
      </Article>

      <Article heading="10. 방침의 변경">
        <p>
          이 방침을 변경하는 경우 변경 사항과 시행일을 서비스 화면에 공지합니다.
          이용자에게 불리한 변경은 시행일 30일 전부터 공지합니다.
        </p>
      </Article>
    </PolicyPage>
  );
}
