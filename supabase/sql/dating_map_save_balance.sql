-- 公帳「對銀行餘額」核對點：存的當下算好帳上的公帳餘額 book_balance
-- 未勾的自己付（method = 'own' and not checked）不扣公帳；已勾的是舊規則「已從公帳轉回」，照樣扣
-- own_pending 是舊核對點的先墊待還，新的存 0
-- 2026-11-01 由正式資料庫 pg_get_functiondef 取出（ledger-own-advance-offset）
CREATE OR REPLACE FUNCTION public.dating_map_save_balance(p_passphrase text, p_checked_on date, p_bank integer, p_card_owed integer, p_note text, p_created_by text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_id bigint;
  v_book integer;
begin
  if not public.dating_map_check_passphrase(p_passphrase) then
    raise exception '密碼錯誤';
  end if;
  if p_checked_on is null or p_bank is null then
    raise exception '日期和銀行餘額要填';
  end if;
  select coalesce(sum(case
           when kind = 'expense' and method = 'own' and not checked then 0
           when kind = 'expense' then -amount
           else amount end), 0)::integer
    into v_book
    from public.dating_map_ledger where spent_on <= p_checked_on;
  insert into public.dating_map_ledger_balances (checked_on, bank, card_owed, own_pending, book_balance, note, created_by)
  values (p_checked_on, p_bank, coalesce(p_card_owed, 0), 0, v_book, nullif(trim(p_note), ''), p_created_by)
  returning id into v_id;
  return v_id;
end;
$function$;
