-- 0027 휴대폰 본인인증
--
-- 쿠폰을 한 사람에게 한 번만 주려면 "같은 사람" 을 가려야 한다. 0024 의
-- 번호 유니크는 같은 번호만 막고, 다른 번호(가족·업무용)로 또 가입하면 뚫린다.
-- 본인인증은 사람마다 고유한 값(CI)을 준다 — 번호를 바꿔도 같은 사람이면 같다.
--
-- **스위치는 꺼진 채로 들어간다.** require_identity = false 면 지금과 똑같이
-- 동작한다. KCP 본인확인 계약이 끝나면 아래 한 줄로 켠다:
--   update public.store_settings set require_identity = true where id = 1;
--
-- **이 SQL 을 먼저 실행하고 앱을 배포한다.** store_settings 에 컬럼이 늘어서
-- 반대로 하면 홈 화면 빌드가 깨진다 (0022·0023 과 같다).

-- 1) 스위치
alter table public.store_settings
  add column if not exists require_identity boolean not null default false;

-- 2) 인증 기록
--
-- profiles 에 두지 않는 이유: profiles 는 본인이 모든 칸을 쓸 수 있다
-- (profiles_own 이 FOR ALL). 거기 "인증됨" 을 두면 손님이 직접 켤 수 있다.
-- 이 테이블은 손님이 읽기만 하고, 쓰기는 아래 함수만 한다.
--
-- CI 원본은 저장하지 않는다. SHA-256 으로 바꾼 값만 둔다 — 같은 사람인지
-- 가리는 데는 그걸로 충분하고, 새더라도 다른 곳에서 쓸 수 없다.
create table if not exists public.identity_verifications (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  -- 이게 1인 1계정이다.
  ci_hash     text not null unique,
  phone       text not null,
  verified_at timestamptz not null default now()
);

alter table public.identity_verifications enable row level security;
revoke all on table public.identity_verifications from anon, authenticated;
grant select on table public.identity_verifications to authenticated;

drop policy if exists identity_own_read on public.identity_verifications;
create policy identity_own_read on public.identity_verifications
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists identity_admin_read on public.identity_verifications;
create policy identity_admin_read on public.identity_verifications
  for select to authenticated using ((select public.is_admin()));

-- 3) 인증 결과 반영
--
-- 서버가 포트원에 본인인증 건을 다시 조회해서 통과한 경우에만 부른다.
-- 브라우저가 직접 부르면 아무 CI 나 넣을 수 있으므로 mark_order_paid 와 같은
-- 좁은 비밀값으로 막는다 (0012). 새 비밀값을 만들지 않고 그것을 같이 쓴다.
--
-- 누구의 인증인지는 인자로 받지 않고 auth.uid() 로 정한다. 남의 계정에
-- 인증을 붙일 길을 아예 두지 않는다.
--
-- 같은 번호를 쥐고 있는 **다른 계정의 번호를 비운다.** 남의 번호를 먼저
-- 적어 둔 계정 때문에 진짜 주인이 가입을 못 하던 문제를 여기서 푼다
-- (통신사가 지금 그 번호의 주인이라고 확인해 준 쪽이 이긴다). 번호를 잃은
-- 계정은 다음 주문 때 다시 인증하게 된다.
create or replace function public.apply_identity_verification(
  p_ci_hash text,
  p_phone   text,
  p_name    text,
  p_secret  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_secret text;
  v_owner  uuid;
begin
  select value into v_secret from public.app_secrets where key = 'payment_webhook';
  if v_secret is null or p_secret is null or p_secret <> v_secret then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'anonymous');
  end if;

  if coalesce(trim(p_ci_hash), '') = '' or coalesce(trim(p_phone), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'incomplete');
  end if;

  -- 이 사람이 이미 다른 계정으로 인증했다
  select user_id into v_owner from public.identity_verifications
   where ci_hash = p_ci_hash;
  if found and v_owner <> v_user then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  -- 이 계정이 이미 다른 사람으로 인증돼 있다
  if exists (select 1 from public.identity_verifications
              where user_id = v_user and ci_hash <> p_ci_hash) then
    return jsonb_build_object('ok', false, 'reason', 'other_person');
  end if;

  update public.profiles set phone = null
   where phone = p_phone and id <> v_user;

  update public.profiles
     set phone = p_phone,
         name  = coalesce(nullif(trim(name), ''), nullif(trim(p_name), ''))
   where id = v_user;

  insert into public.identity_verifications (user_id, ci_hash, phone)
  values (v_user, p_ci_hash, p_phone)
  on conflict (user_id) do update
     set phone = excluded.phone, verified_at = now();

  return jsonb_build_object('ok', true);
end;
$fn$;

revoke all on function public.apply_identity_verification(text, text, text, text) from public;
grant execute on function public.apply_identity_verification(text, text, text, text) to authenticated;

-- 4) 쿠폰 발급에 인증 조건을 건다 (0025 본문을 그대로 옮기고 한 덩어리만 더했다)
create or replace function public.claim_signup_coupon()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_user   uuid := auth.uid();
  v_rule   public.coupons%rowtype;
  v_exists uuid;
  v_phone  text;
begin
  if v_user is null then
    return jsonb_build_object('issued', false, 'reason', 'anonymous');
  end if;

  select phone into v_phone from public.profiles where id = v_user;
  if coalesce(trim(v_phone), '') = '' then
    return jsonb_build_object('issued', false, 'reason', 'no_phone');
  end if;

  -- 0027: 본인인증을 켰으면 인증한 사람에게만 준다. 앱이 아니라 여기서 막는다 —
  -- 이 함수는 브라우저가 공개 키로 직접 부를 수 있다.
  if coalesce((select require_identity from public.store_settings where id = 1), false)
     and not exists (select 1 from public.identity_verifications where user_id = v_user) then
    return jsonb_build_object('issued', false, 'reason', 'not_verified');
  end if;

  select * into v_rule from public.coupons
   where kind = 'signup' and is_active limit 1;
  if not found then
    return jsonb_build_object('issued', false, 'reason', 'no_coupon');
  end if;

  select id into v_exists from public.user_coupons
   where user_id = v_user and coupon_id = v_rule.id;
  if found then
    return jsonb_build_object('issued', false, 'reason', 'already');
  end if;

  insert into public.user_coupons (user_id, coupon_id, expires_at)
  values (v_user, v_rule.id, now() + (v_rule.valid_days || ' days')::interval)
  on conflict (user_id, coupon_id) do nothing;

  return jsonb_build_object('issued', true, 'discount', v_rule.discount);
end;
$fn$;
-- 5) 확인. 아래 세 줄이 모두 나와야 정상이다.
select 'require_identity' as 확인, require_identity::text as 값
  from public.store_settings where id = 1
union all
select 'identity_verifications 테이블', count(*)::text from public.identity_verifications
union all
select 'apply_identity_verification 함수', count(*)::text
  from pg_proc where proname = 'apply_identity_verification';
