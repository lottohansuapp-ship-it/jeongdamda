-- 0026 쿠폰을 관리자 화면에서 만들고 켜고 끄고 보내기
--
-- 0025 는 신규가입 쿠폰 한 종류만 다뤘다. 이제 두 가지가 더 필요하다.
--   · 쿠폰을 여러 개 만들고 각각 켜고 끄기
--   · 특정 회원에게 직접 보내기
--
-- 신규가입 쿠폰은 여전히 **한 번에 하나만** 켜져 있어야 한다. 둘이 켜져 있으면
-- 가입한 손님에게 어느 것을 줄지 알 수 없다. 반면 직접 보내는 쿠폰은
-- 여러 개가 동시에 살아 있어도 된다 — 누구에게 줄지 사람이 정하기 때문이다.

-- 1) 직접 발급 종류를 허용한다.
alter table public.coupons drop constraint if exists coupons_kind_check;
alter table public.coupons
  add constraint coupons_kind_check check (kind in ('signup', 'manual'));

-- 2) "종류당 하나만 켜짐" 은 신규가입에만 적용한다.
drop index if exists public.coupons_active_kind_idx;
create unique index if not exists coupons_active_signup_idx
  on public.coupons (kind) where is_active and kind = 'signup';

/*
 * 고른 회원들에게 쿠폰을 준다.
 *
 * 관리자만 부를 수 있다. is_admin() 을 함수 안에서 다시 본다 —
 * security definer 라 RLS 를 지나치므로 여기서 막지 않으면 누구나 부른다.
 *
 * 이미 받은 사람은 건너뛴다(unique 제약). 같은 명단으로 두 번 눌러도
 * 두 장이 가지 않는다. 몇 명에게 실제로 갔는지 돌려준다.
 */
create or replace function public.grant_coupon(
  p_coupon_id uuid,
  p_user_ids  uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule    public.coupons%rowtype;
  v_granted int;
begin
  if not public.is_admin() then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  select * into v_rule from public.coupons where id = p_coupon_id;
  if not found then
    raise exception '쿠폰을 찾을 수 없습니다.';
  end if;
  if not v_rule.is_active then
    raise exception '꺼져 있는 쿠폰은 보낼 수 없습니다.';
  end if;

  with sent as (
    insert into public.user_coupons (user_id, coupon_id, expires_at)
    select u, p_coupon_id, now() + (v_rule.valid_days || ' days')::interval
      from unnest(p_user_ids) as u
      -- 탈퇴한 회원이 명단에 남아 있을 수 있다.
     where exists (select 1 from public.profiles p where p.id = u)
    on conflict (user_id, coupon_id) do nothing
    returning 1
  )
  select count(*) into v_granted from sent;

  return jsonb_build_object('granted', v_granted);
end;
$$;

revoke all on function public.grant_coupon(uuid, uuid[]) from public;
grant execute on function public.grant_coupon(uuid, uuid[]) to authenticated;

-- 3) 확인
select kind, name, discount, is_active from public.coupons order by kind, name;
