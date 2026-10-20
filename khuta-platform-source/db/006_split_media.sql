-- The master is split into one clip per lesson. lesson.start_sec/end_sec keep
-- the range in the original 29-minute file, which is both the clip's
-- provenance and its duration.
do $$
declare l record; v_asset uuid;
begin
  perform set_config('khuta.tenant_id', (select id::text from tenant where slug='alain'), false);
  for l in select id, no, start_sec, end_sec, tenant_id, asset_id from lesson order by no loop
    if exists (select 1 from media_rendition r
                where r.asset_id = l.asset_id and r.storage_key = format('lesson-%s-720p.mp4', l.no))
    then continue; end if;
    insert into media_asset (tenant_id, original_filename, duration_sec, state)
    values (l.tenant_id, format('copilot final 1.mp4 [%s-%s]', l.start_sec, l.end_sec),
            l.end_sec - l.start_sec, 'ready')
    returning id into v_asset;
    insert into media_rendition (tenant_id, asset_id, label, width, height, bitrate_kbps, storage_key, state)
    values (l.tenant_id, v_asset, '720p', 1280, 720, 1400, format('lesson-%s-720p.mp4', l.no), 'ready');
    update lesson set asset_id = v_asset where id = l.id;
  end loop;
  delete from media_asset a where not exists (select 1 from lesson l2 where l2.asset_id = a.id);
end $$;
