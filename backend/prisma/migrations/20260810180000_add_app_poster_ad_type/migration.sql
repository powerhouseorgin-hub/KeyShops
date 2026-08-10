-- Adds a new Advertisement type: a full-screen poster shown every time the
-- native app is opened or resumes from the background (see
-- AdService.getPublicAppPoster()). Purely additive - existing NOTICE-typed
-- rows and the NOTICE enum value itself are left untouched.
ALTER TYPE "AdType" ADD VALUE 'APP_POSTER';
