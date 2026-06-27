-- Update SuggestionStatus enum to add new values
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'DENIED';
ALTER TYPE "SuggestionStatus" ADD VALUE IF NOT EXISTS 'DELETED';