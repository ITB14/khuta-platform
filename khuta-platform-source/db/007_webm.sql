-- A second rendition per clip in an open codec. H.264/MP4 reaches the widest
-- set of devices; VP9/WebM covers browsers built without the proprietary
-- decoder. The player offers both and the browser picks the one it can play.
-- A rendition is identified by its container and codec, not only by its height.
alter table media_rendition add column if not exists mime text not null default 'video/mp4';

do $$ begin
  perform set_config('khuta.tenant_id', (select id::text from tenant where slug = 'alain'), false);
end $$;

insert into media_rendition (tenant_id, asset_id, label, width, height, bitrate_kbps, storage_key, bytes, mime)
select r.tenant_id, r.asset_id, '720p-vp9', r.width, r.height, 600,
       replace(r.storage_key, '.mp4', '.webm'), 0, 'video/webm'
  from media_rendition r
 where r.label = '720p'
   and not exists (select 1 from media_rendition x
                    where x.asset_id = r.asset_id and x.label = '720p-vp9');
