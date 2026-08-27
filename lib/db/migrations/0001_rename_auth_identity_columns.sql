DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'external_user_id') THEN
    ALTER TABLE users RENAME COLUMN clerk_id TO external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tracks' AND column_name = 'created_by_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tracks' AND column_name = 'created_by_external_user_id') THEN
    ALTER TABLE tracks RENAME COLUMN created_by_clerk_id TO created_by_external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'created_by_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'modules' AND column_name = 'created_by_external_user_id') THEN
    ALTER TABLE modules RENAME COLUMN created_by_clerk_id TO created_by_external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'created_by_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'videos' AND column_name = 'created_by_external_user_id') THEN
    ALTER TABLE videos RENAME COLUMN created_by_clerk_id TO created_by_external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'created_by_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'created_by_external_user_id') THEN
    ALTER TABLE documents RENAME COLUMN created_by_clerk_id TO created_by_external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_access' AND column_name = 'granted_by_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_access' AND column_name = 'granted_by_external_user_id') THEN
    ALTER TABLE document_access RENAME COLUMN granted_by_clerk_id TO granted_by_external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_editor_grants' AND column_name = 'grantee_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_editor_grants' AND column_name = 'grantee_external_user_id') THEN
    ALTER TABLE content_editor_grants RENAME COLUMN grantee_clerk_id TO grantee_external_user_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_editor_grants' AND column_name = 'granted_by_clerk_id')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'content_editor_grants' AND column_name = 'granted_by_external_user_id') THEN
    ALTER TABLE content_editor_grants RENAME COLUMN granted_by_clerk_id TO granted_by_external_user_id;
  END IF;
END $$;