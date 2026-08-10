/**
 * 사업자 정보. 전자상거래법이 초기화면에 표시하라고 정한 항목들이고,
 * 포트원·PG 심사에서도 **신청 시점에 이미 사이트에 있어야** 통과한다.
 * 신청한 뒤에 붙이면 반려된다.
 *
 * 빈칸으로 둔 값은 사장님만 아는 값이라 임의로 채우지 않았다.
 * 사업자등록번호나 통신판매업신고번호를 그럴듯하게 지어내면 그건 허위 표시다.
 * 채우기 전까지 관리자 화면 위에 무엇이 비었는지 계속 뜬다.
 */
export interface StoreInfo {
  /** 상호 */
  name: string;
  /** 대표자 성명 */
  owner: string;
  /** 사업자등록번호 000-00-00000 */
  businessNumber: string;
  /** 통신판매업신고번호 제0000-지역-0000호 */
  mailOrderNumber: string;
  /** 사업장 소재지 (도로명 주소, 상세까지) */
  address: string;
  phone: string;
  email: string;
  /** 개인정보 보호책임자. 보통 대표자와 같다. */
  privacyOfficer: string;
  /**
   * 개인정보가 보관되는 지역. Supabase 프로젝트 리전에 따라 다르다.
   * 서울(ap-northeast-2)이면 국내라 국외이전 고지가 필요 없고,
   * 도쿄(ap-northeast-1) 등이면 개인정보처리방침에 국외이전을 반드시 적어야 한다.
   */
  dataRegion: string;
}

export const STORE_INFO: StoreInfo = {
  /**
   * 사업자등록증에 적힌 상호 그대로다. 간판과 앱에 보이는 「정, 담따」 와 다르다.
   *
   * 이 값은 약관의 계약 주체, 통신판매당사자 고지, 푸터의 상호에 쓰인다.
   * 셋 다 법으로 표시하라고 정한 자리라 **등록된 상호**여야 하고,
   * PG 심사도 등록증과 사이트 표기를 대조한다.
   *
   * 브랜드 이름은 Wordmark 컴포넌트가 따로 들고 있다. 보기 좋게 고치겠다고
   * 이 값을 「정, 담따」 로 바꾸면 표시 의무를 어기게 된다.
   */
  name: "정담다(반찬)",
  owner: "노재순",
  businessNumber: "569-17-02766",
  // 아직 없다. 사업자등록증에는 없는 항목이고 구청에 따로 신고해야 나온다.
  mailOrderNumber: "",
  address:
    "서울특별시 성북구 오패산로 46, 주상가동 117호(하월곡동, 월곡두산위브아파트)",
  phone: "02-6953-8086",
  // 손님 문의를 받을 주소. 아직 못 받았다.
  email: "",
  // 1인 사업자라 대표자가 맡는다. 따로 두시면 그때 바꾼다.
  privacyOfficer: "노재순",
  // 확인함(2026-08-04): Supabase 프로젝트도 Vercel 함수(icn1)도 서울이다.
  // 둘이 같은 지역이라 DB 왕복이 국내에서 끝난다 — 성능에도 이게 최선이다.
  dataRegion: "대한민국 (서울)",
};

const LABELS: Record<keyof StoreInfo, string> = {
  name: "상호",
  owner: "대표자",
  businessNumber: "사업자등록번호",
  mailOrderNumber: "통신판매업신고번호",
  address: "사업장 주소",
  phone: "전화번호",
  email: "이메일",
  privacyOfficer: "개인정보 보호책임자",
  dataRegion: "데이터 보관 지역",
};

/** 아직 안 채운 항목. 이 배열이 비어야 PG 심사를 넣을 수 있다. */
export function missingStoreInfo(info: StoreInfo = STORE_INFO): string[] {
  return (Object.keys(LABELS) as (keyof StoreInfo)[])
    .filter((key) => info[key].trim() === "")
    .map((key) => LABELS[key]);
}

/** 초기화면 푸터에 뿌릴 항목. 값이 비어 있으면 비었다는 게 보여야 한다. */
export function storeInfoRows(
  info: StoreInfo = STORE_INFO,
): { label: string; value: string }[] {
  const shown: (keyof StoreInfo)[] = [
    "name",
    "owner",
    "businessNumber",
    "mailOrderNumber",
    "address",
    "phone",
    "email",
  ];
  return shown.map((key) => ({ label: LABELS[key], value: info[key].trim() }));
}
