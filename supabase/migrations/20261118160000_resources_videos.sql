-- Resources → Videos: MP4s go in the same private "documents" bucket as
-- the PDFs and decks (documents.file_type = 'mp4'; no table change).
-- If the bucket only accepts certain file types, add MP4 to the list; a
-- bucket without a list already takes them.
update storage.buckets
   set allowed_mime_types = array_append(allowed_mime_types, 'video/mp4')
 where id = 'documents'
   and allowed_mime_types is not null
   and not ('video/mp4' = any (allowed_mime_types));

-- If the bucket has its own size cap below 500 MB, raise it so videos fit.
-- (The project-wide upload limit in Supabase → Storage settings still applies.)
update storage.buckets
   set file_size_limit = 524288000
 where id = 'documents'
   and file_size_limit is not null
   and file_size_limit < 524288000;
