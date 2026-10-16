-- 0031 사장님이 손님 비밀번호를 임시 비밀번호로 바꿔 주기 (2026-10-16)
--
-- 휴대폰 번호로 가입한 손님(문자 인증 없음, 사용자 결정 ②)은 비밀번호를 잊으면
-- 메일로 재설정할 수 없다 — 로그인 아이디가 사장님 메일의 + 주소다(phone-login.ts).
-- 그래서 손님이 매장에 전화하면 사장님이 관리자 화면에서 임시 비밀번호(숫자 8자리)를
-- 만들어 불러 준다. 손님은 로그인한 뒤 「내 정보 → 비밀번호 바꾸기」 로 바꾼다.
--
-- 사장님(is_admin)만 부를 수 있다. 전화한 사람이 번호 주인인지는 사장님이
-- 그 번호로 다시 걸어 확인한다 — 관리자 화면에 그렇게 적어 둔다.
--
-- 암호는 Supabase 기본 확장 pgcrypto(extensions 스키마)의 bcrypt 로 만든다.
-- GoTrue 가 쓰는 것과 같은 형식이라 바로 로그인된다.

create or replace function public.admin_reset_password(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_name text;
  v_temp text;
begin
  if not public.is_admin() then
    raise exception '관리자만 할 수 있어요.' using errcode = '42501';
  end if;

  select id, name into v_user, v_name
    from public.profiles
   where phone = p_phone;
  if not found then
    return jsonb_build_object('found', false);
  end if;

  -- 전화로 불러 주기 쉬운 숫자 8자리. random() 대신 암호용 난수를 쓴다.
  v_temp := lpad(
    ((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text,
    8, '0');

  update auth.users
     set encrypted_password = extensions.crypt(v_temp, extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_user;

  return jsonb_build_object('found', true, 'name', v_name, 'password', v_temp);
end;
$$;

-- Supabase 는 새 함수를 anon·authenticated 에게 자동으로 연다. 손님(anon)은 막는다.
revoke all on function public.admin_reset_password(text) from public, anon, authenticated;
grant execute on function public.admin_reset_password(text) to authenticated;


-- 확인용 결과 줄
select
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'admin_reset_password')
    as "admin_reset_password (1이면 정상)",
  has_function_privilege('anon', 'public.admin_reset_password(text)', 'execute')
    as "로그인 안 한 사람 호출 (false 정상)",
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'extensions' and p.proname = 'crypt') > 0
    as "pgcrypto 있음 (true 정상)";
