-- 0024 전화번호를 한 사람당 하나로
--
-- 쿠폰을 1인 1회로 주려면 같은 사람이 계정을 여러 개 만드는 것을 막아야 한다.
-- 지금은 같은 번호로 계정을 몇 개든 만들 수 있다.
--
-- 이걸로 다 막히지는 않는다. 번호를 더 구하면 뚫린다. 다만 비용이 0 이고
-- "가입 또 해서 쿠폰 또 받기" 의 대부분을 막는다. 더 확실히 막으려면
-- 휴대폰 본인인증(CI)이 필요한데 건당 비용이 붙는다.
--
-- normalizePhone() 이 저장 전에 010-1234-5678 형태로 맞춰 준다. 형식이
-- 일정하니 유니크 제약이 실제로 걸린다.
--
-- 이 파일은 **컬럼을 추가하지 않는다.** 인덱스만 만들어서 앱 배포 순서와
-- 무관하다 (0022/0023 과 다르다).

-- 1) 먼저 중복이 있는지 본다. 있으면 아래 인덱스 만들기가 실패한다.
--    결과가 0행이어야 정상이다.
select phone, count(*) as 계정수
  from public.profiles
 where phone is not null
 group by phone
having count(*) > 1;

-- 2) 번호가 있는 줄만 유일하게. null 은 여럿이어도 된다 —
--    가입 직후 번호를 아직 안 넣은 손님이 그 상태다.
create unique index if not exists profiles_phone_unique
  on public.profiles (phone)
  where phone is not null;

-- 3) 확인. 인덱스가 생겼으면 한 줄 나온다.
select indexname from pg_indexes
 where schemaname = 'public' and indexname = 'profiles_phone_unique';
