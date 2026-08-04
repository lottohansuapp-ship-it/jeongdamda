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
  name: "정, 담따 반찬가게",
  owner: "",
  businessNumber: "",
  mailOrderNumber: "",
  address: "",
  phone: "02-6953-8086",
  email: "",
  privacyOfficer: "",
  dataRegion: "",
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
