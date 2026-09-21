-- Proof that the constraints in constraints.sql actually reject the bad case.
--
-- Twenty-four assertions. Each one names a rule the platform claims to
-- enforce, and each one tries to break it: the ones marked "allowed, as it
-- should be" matter just as much, because a constraint that rejects everything
-- is not a constraint, it is an outage.
--
-- Run against a FRESH database — it seeds fixed ids and the event log cannot be
-- truncated, by design. `npm run db:test` sets one up and tears it down.

\set ON_ERROR_STOP on
SET client_min_messages = notice;

-- Seed the minimum needed to exercise the rules.
INSERT INTO "Person"(id,"fullName","dateOfBirth","updatedAt","nationalInsurance")
  VALUES ('p1','Test Officer','1990-01-01',now(),'QQ123456C'),
         ('p2','Second Officer','1991-02-02',now(),NULL),
         ('p3','A Controller','1985-03-03',now(),NULL);
INSERT INTO "User"(id,"personId","displayName") VALUES
  ('u1','p1','Test Officer'), ('u3','p3','A Controller');
INSERT INTO "Client"(id,name) VALUES ('c1','Test Client');
INSERT INTO "Site"(id,"clientId",name) VALUES ('s1','c1','Test Site');
INSERT INTO "Post"(id,"siteId",name) VALUES ('post1','s1','Gatehouse'), ('post2','s1','Patrol');
INSERT INTO "DocumentType"(id,label,department,"copyRetained","expires")
  VALUES ('crc','Criminality outcome','vetting',false,false),
         ('sia','SIA licence','compliance',true,true);
INSERT INTO "Employment"(id,"personId",pin,"startedAt") VALUES ('e1','p1','4417','2026-01-01');

CREATE OR REPLACE FUNCTION expect_failure(name text, stmt text) RETURNS void AS $$
BEGIN
  BEGIN
    EXECUTE stmt;
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'PASS  %  <- %', rpad(name, 46), left(replace(SQLERRM, E'\n', ' '), 62);
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL: % was ALLOWED', name;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION expect_success(name text, stmt text) RETURNS void AS $$
BEGIN
  EXECUTE stmt;
  RAISE NOTICE 'PASS  %  <- allowed, as it should be', rpad(name, 46);
END;
$$ LANGUAGE plpgsql;

-- 1. Separation of duties [6.1, 7.5.2b]
SELECT expect_failure('self-administers own screening file (6.1)',
  $$INSERT INTO "ScreeningFile"(id,"personId","administratorUserId") VALUES ('f1','p1','u1')$$);
SELECT expect_failure('self-reviews own screening file (6.1)',
  $$INSERT INTO "ScreeningFile"(id,"personId","controllerUserId") VALUES ('f2','p1','u1')$$);
SELECT expect_failure('controller is also the administrator (7.5.2b)',
  $$INSERT INTO "ScreeningFile"(id,"personId","administratorUserId","controllerUserId")
    VALUES ('f3','p2','u3','u3')$$);
SELECT expect_success('a properly separated file',
  $$INSERT INTO "ScreeningFile"(id,"personId","administratorUserId","controllerUserId")
    VALUES ('f4','p2','u1','u3')$$);

-- 2. Overlapping assignments
SELECT expect_success('first shift for an officer',
  $$INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt",state)
    VALUES ('a1','p1','post1','2026-10-01 19:00+01','2026-10-02 07:00+01','published')$$);
SELECT expect_failure('same officer, overlapping shift',
  $$INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt",state)
    VALUES ('a2','p1','post2','2026-10-01 22:00+01','2026-10-02 10:00+01','published')$$);
SELECT expect_success('same officer, back-to-back shift (no overlap)',
  $$INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt",state)
    VALUES ('a3','p1','post2','2026-10-02 07:00+01','2026-10-02 19:00+01','published')$$);
SELECT expect_failure('shift that ends before it starts',
  $$INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt")
    VALUES ('a4','p2','post1','2026-10-05 19:00+01','2026-10-05 07:00+01')$$);

-- 3. Append-only event log
SELECT expect_success('write an event',
  $$INSERT INTO "Event"(id,type,department,"actorSystem",detail)
    VALUES ('ev1','check_call.recorded','control','scheduler','All well')$$);
SELECT expect_failure('edit an event',
  $$UPDATE "Event" SET detail = 'rewritten' WHERE id = 'ev1'$$);
SELECT expect_failure('delete an event',
  $$DELETE FROM "Event" WHERE id = 'ev1'$$);
SELECT expect_failure('event with no actor at all',
  $$INSERT INTO "Event"(id,type,department) VALUES ('ev2','orphan','control')$$);

-- 4. Data minimisation
SELECT expect_failure('keep a copy of a criminality certificate',
  $$INSERT INTO "DocumentRecord"(id,"typeId","personId","storageKey")
    VALUES ('d1','crc','p1','s3://bucket/cert.pdf')$$);
SELECT expect_success('record the outcome without a copy',
  $$INSERT INTO "DocumentRecord"(id,"typeId","personId",verification)
    VALUES ('d2','crc','p1','verified')$$);

-- 5. Exactly one subject
SELECT expect_failure('document owned by a person AND a site',
  $$INSERT INTO "DocumentRecord"(id,"typeId","personId","siteId")
    VALUES ('d3','sia','p1','s1')$$);
SELECT expect_failure('document owned by nothing',
  $$INSERT INTO "DocumentRecord"(id,"typeId") VALUES ('d4','sia')$$);

-- 6. The standard's own limits [7.6]
SELECT expect_failure('a three-week extension',
  $$UPDATE "ScreeningFile" SET "extensionWeeks" = 3 WHERE id = 'f4'$$);
SELECT expect_failure('a four-week extension with no approver',
  $$UPDATE "ScreeningFile" SET "extensionWeeks" = 4 WHERE id = 'f4'$$);
SELECT expect_success('a four-week extension, approved and dated',
  $$UPDATE "ScreeningFile" SET "extensionWeeks" = 4,
      "extensionApprovedById" = 'u3', "extensionApprovedAt" = now() WHERE id = 'f4'$$);
SELECT expect_failure('a seven-year screening period',
  $$UPDATE "ScreeningFile" SET "screeningPeriodYears" = 7 WHERE id = 'f4'$$);

-- 7. Hours cannot be half-approved
SELECT expect_failure('book-off approved by someone, with no time',
  $$INSERT INTO "BookOff"(id,"assignmentId",at,channel,"approvedById")
    VALUES ('bo1','a1',now(),'app','u3')$$);

-- 8. Duplicate prevention
SELECT expect_failure('a second person with the same NI number',
  $$INSERT INTO "Person"(id,"fullName","dateOfBirth","updatedAt","nationalInsurance")
    VALUES ('p9','Someone Else','1992-04-04',now(),'QQ123456C')$$);
SELECT expect_failure('reusing a PIN',
  $$INSERT INTO "Employment"(id,"personId",pin,"startedAt")
    VALUES ('e2','p2','4417','2026-02-01')$$);
SELECT expect_failure('the same normalised identity key twice',
  $$INSERT INTO "PersonIdentityKey"(id,"personId",kind,value) VALUES
      ('k1','p1','sia_licence','101022334455'),
      ('k2','p2','sia_licence','101022334455')$$);
