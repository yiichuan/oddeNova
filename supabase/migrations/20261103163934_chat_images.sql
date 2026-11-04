insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
create policy "Owners read chat images" on storage.objects for select to authenticated
using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners upload chat images" on storage.objects for insert to authenticated
with check (bucket_id = 'chat-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Owners delete chat images" on storage.objects for delete to authenticated
using (bucket_id = 'chat-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
