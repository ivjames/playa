-- DropTable
DROP TABLE "Verification";

-- Rebuild Profile: drop `verified`, add `flagged`.
-- Existing `verified = 'flagged'` rows are preserved as `flagged = true`.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "pn" TEXT NOT NULL,
    "dn" TEXT,
    "pronouns" TEXT,
    "avatar" TEXT,
    "bio" TEXT,
    "years" INTEGER NOT NULL DEFAULT 0,
    "burns" INTEGER NOT NULL DEFAULT 0,
    "role" TEXT,
    "camp" TEXT,
    "avail" TEXT,
    "contactPref" TEXT NOT NULL DEFAULT 'in_app',
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "regionId" TEXT,
    "homeCity" TEXT,
    "geohash" TEXT,
    "skills" TEXT NOT NULL DEFAULT '[]',
    "interests" TEXT NOT NULL DEFAULT '[]',
    "projects" TEXT NOT NULL DEFAULT '[]',
    "looking" TEXT NOT NULL DEFAULT '[]',
    "langs" TEXT NOT NULL DEFAULT '[]',
    "regional" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Profile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Profile_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Profile" ("id", "userId", "pn", "dn", "pronouns", "avatar", "bio", "years", "burns", "role", "camp", "avail", "contactPref", "visibility", "flagged", "regionId", "homeCity", "geohash", "skills", "interests", "projects", "looking", "langs", "regional", "createdAt", "updatedAt")
SELECT "id", "userId", "pn", "dn", "pronouns", "avatar", "bio", "years", "burns", "role", "camp", "avail", "contactPref", "visibility", CASE WHEN "verified" = 'flagged' THEN true ELSE false END, "regionId", "homeCity", "geohash", "skills", "interests", "projects", "looking", "langs", "regional", "createdAt", "updatedAt"
FROM "Profile";
DROP TABLE "Profile";
ALTER TABLE "new_Profile" RENAME TO "Profile";
CREATE UNIQUE INDEX "Profile_userId_key" ON "Profile"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
