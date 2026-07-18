-- Onboarding Config
CREATE TABLE IF NOT EXISTS "OnboardingConfig" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "premiumLockedAt" TIMESTAMPTZ(6),
  "lastPremiumActiveAt" TIMESTAMPTZ(6),
  "panelChannelId" TEXT,
  "panelMessageId" TEXT,
  "defaultReviewChannelId" TEXT,
  "fallbackToAppealsChannel" BOOLEAN NOT NULL DEFAULT false,
  "useServerIcon" BOOLEAN NOT NULL DEFAULT true,
  "useServerBanner" BOOLEAN NOT NULL DEFAULT false,
  "showDiscoreBranding" BOOLEAN NOT NULL DEFAULT true,
  "maxApplicationTypes" INTEGER NOT NULL DEFAULT 3,
  "allowDmFlow" BOOLEAN NOT NULL DEFAULT true,
  "allowThreadFallback" BOOLEAN NOT NULL DEFAULT false,
  "draftExpiryHours" INTEGER NOT NULL DEFAULT 72,
  "keepSubmittedApplications" BOOLEAN NOT NULL DEFAULT true,
  "panelEmbedTitle" TEXT,
  "panelEmbedDescription" TEXT,
  "panelEmbedFooter" TEXT,
  "panelEmbedColor" TEXT,
  "panelThumbnailUrl" TEXT,
  "panelImageUrl" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingConfig_guildId_key" ON "OnboardingConfig"("guildId");
CREATE INDEX IF NOT EXISTS "OnboardingConfig_guildId_idx" ON "OnboardingConfig"("guildId");

-- Onboarding Application Type
CREATE TABLE IF NOT EXISTS "OnboardingApplicationType" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "publicTitle" TEXT NOT NULL,
  "publicDescription" TEXT,
  "instructions" TEXT,
  "buttonLabel" TEXT NOT NULL DEFAULT 'Apply',
  "buttonEmoji" TEXT,
  "buttonStyle" TEXT NOT NULL DEFAULT 'PRIMARY',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "reviewChannelId" TEXT,
  "themeColor" TEXT,
  "thumbnailUrl" TEXT,
  "imageUrl" TEXT,
  "allowFiles" BOOLEAN NOT NULL DEFAULT false,
  "allowRequestChanges" BOOLEAN NOT NULL DEFAULT true,
  "allowApplicantEdit" BOOLEAN NOT NULL DEFAULT false,
  "allowReviewThread" BOOLEAN NOT NULL DEFAULT true,
  "allowPullApplicantIntoThread" BOOLEAN NOT NULL DEFAULT true,
  "acceptRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "removeRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "denyAction" TEXT NOT NULL DEFAULT 'DM_ONLY',
  "denyRoleId" TEXT,
  "pendingRoleId" TEXT,
  "kickOnDeny" BOOLEAN NOT NULL DEFAULT false,
  "banOnDeny" BOOLEAN NOT NULL DEFAULT false,
  "sendDmOnDecision" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingApplicationType_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingApplicationType_guildId_idx" ON "OnboardingApplicationType"("guildId");

-- Onboarding Form Page
CREATE TABLE IF NOT EXISTS "OnboardingFormPage" (
  "id" TEXT NOT NULL,
  "applicationTypeId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Page',
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingFormPage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingFormPage_applicationTypeId_idx" ON "OnboardingFormPage"("applicationTypeId");

-- Onboarding Form Field
CREATE TABLE IF NOT EXISTS "OnboardingFormField" (
  "id" TEXT NOT NULL,
  "pageId" TEXT NOT NULL,
  "applicationTypeId" TEXT NOT NULL,
  "fieldType" TEXT NOT NULL DEFAULT 'TEXT_SHORT',
  "label" TEXT NOT NULL,
  "helpText" TEXT,
  "placeholder" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "minLength" INTEGER,
  "maxLength" INTEGER,
  "minChoices" INTEGER,
  "maxChoices" INTEGER,
  "allowedFileTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "maxFileSize" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingFormField_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingFormField_pageId_idx" ON "OnboardingFormField"("pageId");
CREATE INDEX IF NOT EXISTS "OnboardingFormField_applicationTypeId_idx" ON "OnboardingFormField"("applicationTypeId");

-- Onboarding Field Option
CREATE TABLE IF NOT EXISTS "OnboardingFieldOption" (
  "id" TEXT NOT NULL,
  "fieldId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "emoji" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "linkedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingFieldOption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingFieldOption_fieldId_idx" ON "OnboardingFieldOption"("fieldId");

-- Onboarding Role Rule
CREATE TABLE IF NOT EXISTS "OnboardingRoleRule" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "applicationTypeId" TEXT,
  "triggerType" TEXT NOT NULL DEFAULT 'DECISION',
  "triggerFieldId" TEXT,
  "triggerOptionValue" TEXT,
  "applyWhen" TEXT NOT NULL DEFAULT 'APPROVED',
  "rolesToAdd" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "rolesToRemove" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "requiresStaffConfirm" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingRoleRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingRoleRule_guildId_idx" ON "OnboardingRoleRule"("guildId");
CREATE INDEX IF NOT EXISTS "OnboardingRoleRule_applicationTypeId_idx" ON "OnboardingRoleRule"("applicationTypeId");

-- Onboarding Application
CREATE TABLE IF NOT EXISTS "OnboardingApplication" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "applicationNumber" INTEGER NOT NULL,
  "applicationTypeId" TEXT,
  "applicantId" TEXT NOT NULL,
  "applicantUsernameSnapshot" TEXT,
  "applicantDisplayNameSnapshot" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "serverMemberStatus" TEXT NOT NULL DEFAULT 'IN_SERVER',
  "submittedAt" TIMESTAMPTZ(6),
  "decidedAt" TIMESTAMPTZ(6),
  "decidedById" TEXT,
  "decisionReason" TEXT,
  "reviewChannelId" TEXT,
  "reviewMessageId" TEXT,
  "reviewThreadId" TEXT,
  "reviewThreadStatus" TEXT NOT NULL DEFAULT 'NONE',
  "receiptGeneratedAt" TIMESTAMPTZ(6),
  "threadTranscriptCreatedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingApplication_guildId_applicationNumber_key" ON "OnboardingApplication"("guildId", "applicationNumber");
CREATE INDEX IF NOT EXISTS "OnboardingApplication_guildId_idx" ON "OnboardingApplication"("guildId");
CREATE INDEX IF NOT EXISTS "OnboardingApplication_applicantId_idx" ON "OnboardingApplication"("applicantId");
CREATE INDEX IF NOT EXISTS "OnboardingApplication_status_idx" ON "OnboardingApplication"("status");
CREATE INDEX IF NOT EXISTS "OnboardingApplication_applicationTypeId_idx" ON "OnboardingApplication"("applicationTypeId");

-- Onboarding Answer
CREATE TABLE IF NOT EXISTS "OnboardingAnswer" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "fieldId" TEXT,
  "fieldLabelSnapshot" TEXT,
  "fieldType" TEXT,
  "answerText" TEXT,
  "answerJson" JSONB,
  "selectedOptionValues" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "selectedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "fileRefs" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingAnswer_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingAnswer_applicationId_idx" ON "OnboardingAnswer"("applicationId");

-- Onboarding Staff Note
CREATE TABLE IF NOT EXISTS "OnboardingStaffNote" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "noteText" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6),
  "deletedAt" TIMESTAMPTZ(6),

  CONSTRAINT "OnboardingStaffNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingStaffNote_applicationId_idx" ON "OnboardingStaffNote"("applicationId");
CREATE INDEX IF NOT EXISTS "OnboardingStaffNote_guildId_idx" ON "OnboardingStaffNote"("guildId");

-- Onboarding Decision Log
CREATE TABLE IF NOT EXISTS "OnboardingDecisionLog" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT,
  "detailsJson" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingDecisionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingDecisionLog_applicationId_idx" ON "OnboardingDecisionLog"("applicationId");
CREATE INDEX IF NOT EXISTS "OnboardingDecisionLog_guildId_idx" ON "OnboardingDecisionLog"("guildId");

-- Onboarding Application Transcript
CREATE TABLE IF NOT EXISTS "OnboardingApplicationTranscript" (
  "id" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "threadId" TEXT,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL DEFAULT 'text/plain',
  "storageRef" TEXT,
  "transcriptText" TEXT,
  "messageCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingApplicationTranscript_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingApplicationTranscript_applicationId_idx" ON "OnboardingApplicationTranscript"("applicationId");
CREATE INDEX IF NOT EXISTS "OnboardingApplicationTranscript_guildId_idx" ON "OnboardingApplicationTranscript"("guildId");

-- Onboarding Session / Draft State
CREATE TABLE IF NOT EXISTS "OnboardingSession" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "applicationTypeId" TEXT,
  "applicantId" TEXT NOT NULL,
  "applicationId" TEXT,
  "currentPage" INTEGER NOT NULL DEFAULT 0,
  "stateJson" JSONB,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingSession_guildId_idx" ON "OnboardingSession"("guildId");
CREATE INDEX IF NOT EXISTS "OnboardingSession_applicantId_idx" ON "OnboardingSession"("applicantId");
CREATE INDEX IF NOT EXISTS "OnboardingSession_expiresAt_idx" ON "OnboardingSession"("expiresAt");

-- Onboarding Permission Role
CREATE TABLE IF NOT EXISTS "OnboardingPermissionRole" (
  "id" TEXT NOT NULL,
  "guildId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "canManage" BOOLEAN NOT NULL DEFAULT false,
  "canBuildForms" BOOLEAN NOT NULL DEFAULT false,
  "canReview" BOOLEAN NOT NULL DEFAULT false,
  "canApproveDeny" BOOLEAN NOT NULL DEFAULT false,
  "canOpenThreads" BOOLEAN NOT NULL DEFAULT false,
  "canDownload" BOOLEAN NOT NULL DEFAULT false,
  "canDelete" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),

  CONSTRAINT "OnboardingPermissionRole_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "OnboardingPermissionRole_guildId_idx" ON "OnboardingPermissionRole"("guildId");
CREATE INDEX IF NOT EXISTS "OnboardingPermissionRole_roleId_idx" ON "OnboardingPermissionRole"("roleId");
CREATE UNIQUE INDEX IF NOT EXISTS "OnboardingPermissionRole_guildId_roleId_key" ON "OnboardingPermissionRole"("guildId", "roleId");