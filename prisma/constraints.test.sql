-- Proof that the constraints in constraints.sql actually reject the bad case.
--
-- One hundred and sixty-three assertions. Each one names a rule the platform claims to
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

-- 9. The disposal log  [clause 11, C14]
SELECT expect_success('record a disposal',
  $$INSERT INTO "DisposalRecord"(id,rule,"subjectDescription","performedBySystem","retainedInstead")
    VALUES ('dl1','unsuccessful_applicant_12_months',
            'Screening file for an unsuccessful applicant, application Mar 2025',
            'retention-sweep','Outcome and date of the criminality check')$$);
SELECT expect_failure('edit a disposal log entry',
  $$UPDATE "DisposalRecord" SET "subjectDescription" = 'something else' WHERE id = 'dl1'$$);
SELECT expect_failure('delete a disposal log entry',
  $$DELETE FROM "DisposalRecord" WHERE id = 'dl1'$$);
SELECT expect_failure('a disposal nobody performed',
  $$INSERT INTO "DisposalRecord"(id,rule,"subjectDescription")
    VALUES ('dl2','after_cessation_7_years','Leaver file')$$);
SELECT expect_failure('a disposal performed by both a person and the sweep',
  $$INSERT INTO "DisposalRecord"(id,rule,"subjectDescription","performedByUserId","performedBySystem")
    VALUES ('dl3','after_cessation_7_years','Leaver file','u3','retention-sweep')$$);
SELECT expect_failure('a disposal that destroyed nothing',
  $$INSERT INTO "DisposalRecord"(id,rule,"subjectDescription","performedBySystem","itemsDestroyed")
    VALUES ('dl4','after_cessation_7_years','Leaver file','retention-sweep',0)$$);

-- ---------------------------------------------------------------------------
-- 10. The Admin department
-- ---------------------------------------------------------------------------
-- The approval rules are the reason the department exists in the platform, so
-- they get the most attention here. u1 is the requester throughout; u3 is a
-- different person who may decide.

INSERT INTO "Supplier"(id,name,category) VALUES ('sup1','Test Landlord','premises');

SELECT expect_success('raise an Admin request',
  $$INSERT INTO "AdminItem"(id,reference,track,category,kind,title,"amountPence",
                            "requestedByUserId","dueAt","supplierId")
    VALUES ('ai1','ADM-0001','request','payments','payment','Quarterly service charge',
            450000,'u1',now() + interval '1 day','sup1')$$);

SELECT expect_failure('a request with no kind',
  $$INSERT INTO "AdminItem"(id,reference,track,category,title,"requestedByUserId","dueAt")
    VALUES ('ai2','ADM-0002','request','payments','No kind given','u1',now())$$);
SELECT expect_failure('a task pretending to ask for something',
  $$INSERT INTO "AdminItem"(id,reference,track,category,kind,title,"requestedByUserId","dueAt")
    VALUES ('ai3','ADM-0003','task','uniform','purchase','Count the stock','u1',now())$$);
SELECT expect_failure('an item about two subjects at once',
  $$INSERT INTO "AdminItem"(id,reference,track,category,title,"requestedByUserId","dueAt",
                            "supplierId","assetId")
    VALUES ('ai4','ADM-0004','task','premises','Two subjects','u1',now(),'sup1','nope')$$);
SELECT expect_failure('a negative amount',
  $$INSERT INTO "AdminItem"(id,reference,track,category,kind,title,"amountPence",
                            "requestedByUserId","dueAt")
    VALUES ('ai5','ADM-0005','request','payments','payment','Negative',-100,'u1',now())$$);
SELECT expect_success('an Admin task about the department itself',
  $$INSERT INTO "AdminItem"(id,reference,track,category,title,"requestedByUserId","dueAt")
    VALUES ('ai6','ADM-0006','task','uniform','Count the uniform stock','u1',now())$$);

-- The chain: two rungs on a payment over the high threshold.
SELECT expect_success('write out the approval chain',
  $$INSERT INTO "AdminApproval"(id,"itemId",step,"requiredRoles",reason) VALUES
      ('ap1','ai1',1,ARRAY['finance_officer']::"Role"[],'Over the high threshold'),
      ('ap2','ai1',2,ARRAY['top_management']::"Role"[],'Second, different approver')$$);

SELECT expect_failure('the requester approving their own request',
  $$UPDATE "AdminApproval" SET decision='approved',"decidedByUserId"='u1',"decidedAt"=now()
    WHERE id='ap1'$$);
SELECT expect_failure('approve a request that still has a rung outstanding',
  $$UPDATE "AdminItem" SET state='approved' WHERE id='ai1'$$);
SELECT expect_failure('half a decision — a verdict with no author',
  $$UPDATE "AdminApproval" SET decision='approved' WHERE id='ap1'$$);
SELECT expect_failure('a verdict that is neither approved nor rejected',
  $$UPDATE "AdminApproval" SET decision='maybe',"decidedByUserId"='u3',"decidedAt"=now()
    WHERE id='ap1'$$);
SELECT expect_failure('a rejection with no grounds',
  $$UPDATE "AdminApproval" SET decision='rejected',"decidedByUserId"='u3',"decidedAt"=now()
    WHERE id='ap1'$$);
SELECT expect_success('a different person signs the first rung',
  $$UPDATE "AdminApproval" SET decision='approved',"decidedByUserId"='u3',"decidedAt"=now()
    WHERE id='ap1'$$);
SELECT expect_failure('the same person signing the second rung too',
  $$UPDATE "AdminApproval" SET decision='approved',"decidedByUserId"='u3',"decidedAt"=now()
    WHERE id='ap2'$$);

-- A request about a member of staff: the subject cannot decide it.
INSERT INTO "AdminItem"(id,reference,track,category,kind,title,"amountPence",
                        "requestedByUserId","aboutPersonId","dueAt")
  VALUES ('ai7','ADM-0007','request','decisions','penalty','Lost site key',
          5000,'u1','p3',now() + interval '1 day');
INSERT INTO "AdminApproval"(id,"itemId",step,"requiredRoles",reason)
  VALUES ('ap7','ai7',1,ARRAY['recruitment_manager']::"Role"[],'Affects a member of staff');
SELECT expect_failure('the subject of a penalty approving it',
  $$UPDATE "AdminApproval" SET decision='approved',"decidedByUserId"='u3',"decidedAt"=now()
    WHERE id='ap7'$$);

-- Dates, money and stock.
SELECT expect_failure('a holiday request that ends before it starts',
  $$INSERT INTO "HolidayRequest"(id,"personId","startsOn","endsOn","hoursRequested")
    VALUES ('h1','p1','2026-06-10','2026-06-01',36)$$);
SELECT expect_failure('a holiday request for no hours',
  $$INSERT INTO "HolidayRequest"(id,"personId","startsOn","endsOn","hoursRequested")
    VALUES ('h2','p1','2026-06-01','2026-06-05',0)$$);
SELECT expect_failure('a holiday decision with no decider',
  $$INSERT INTO "HolidayRequest"(id,"personId","startsOn","endsOn","hoursRequested",decision)
    VALUES ('h3','p1','2026-06-01','2026-06-05',36,'approved')$$);
SELECT expect_success('a pending holiday request',
  $$INSERT INTO "HolidayRequest"(id,"personId","startsOn","endsOn","hoursRequested")
    VALUES ('h4','p1','2026-06-01','2026-06-05',36)$$);

SELECT expect_failure('a weekly payment with a day of the month',
  $$INSERT INTO "RecurringPayment"(id,"supplierId",label,"agreedAmountPence",frequency,
                                   "dayOfMonth","firstDueOn")
    VALUES ('rp1','sup1','Weekly cleaning',20000,'weekly',15,'2026-10-01')$$);
SELECT expect_failure('a monthly payment with no day of the month',
  $$INSERT INTO "RecurringPayment"(id,"supplierId",label,"agreedAmountPence",frequency,"firstDueOn")
    VALUES ('rp2','sup1','Office rent',180000,'monthly','2026-10-01')$$);
SELECT expect_success('office rent, monthly, on the 1st',
  $$INSERT INTO "RecurringPayment"(id,"supplierId",label,"agreedAmountPence",frequency,
                                   "dayOfMonth","firstDueOn")
    VALUES ('rp3','sup1','Office rent',180000,'monthly',1,'2026-10-01')$$);
SELECT expect_failure('a payment marked paid with no amount',
  $$INSERT INTO "PaymentInstance"(id,"recurringPaymentId","dueOn","amountDuePence","paidOn")
    VALUES ('pi1','rp3','2026-10-01',180000,'2026-09-30')$$);
SELECT expect_failure('two payment instances for the same due date',
  $$INSERT INTO "PaymentInstance"(id,"recurringPaymentId","dueOn","amountDuePence") VALUES
      ('pi2','rp3','2026-11-01',180000),
      ('pi3','rp3','2026-11-01',180000)$$);

INSERT INTO "EquipmentItem"(id,category,label) VALUES ('eq1','uniform','Cargo trousers');
INSERT INTO "StockItem"(id,"equipmentItemId",size,"reorderLevel")
  VALUES ('st1','eq1','34R',6);
SELECT expect_failure('a return that reduces stock',
  $$INSERT INTO "StockMovement"(id,"stockItemId",kind,quantity)
    VALUES ('sm1','st1','returned',-2)$$);
SELECT expect_failure('an issue that increases stock',
  $$INSERT INTO "StockMovement"(id,"stockItemId",kind,quantity)
    VALUES ('sm2','st1','issued',3)$$);
SELECT expect_failure('an adjustment of nothing',
  $$INSERT INTO "StockMovement"(id,"stockItemId",kind,quantity)
    VALUES ('sm3','st1','adjustment',0)$$);
SELECT expect_success('receive stock',
  $$INSERT INTO "StockMovement"(id,"stockItemId",kind,quantity)
    VALUES ('sm4','st1','received',12)$$);
SELECT expect_failure('two stock rows for the same item and size',
  $$INSERT INTO "StockItem"(id,"equipmentItemId",size) VALUES ('st2','eq1','34R')$$);

SELECT expect_failure('a penalty written off with no reason',
  $$INSERT INTO "Penalty"(id,reference,"personId",kind,"amountPence",grounds,state,"writtenOffOn")
    VALUES ('pen1','PEN-1','p1','fine',5000,'Lost key','written_off','2026-09-01')$$);
SELECT expect_failure('a voucher that expires before it is issued',
  $$INSERT INTO "Voucher"(id,reference,"valuePence",purpose,"issuedOn","expiresOn")
    VALUES ('v1','VCH-1',2500,'Long service','2026-09-01','2026-08-01')$$);

INSERT INTO "Accreditation"(id,name,body,scope,"expiresOn")
  VALUES ('acc1','ACS','SIA','Security guarding','2027-03-31');
SELECT expect_failure('derived evidence that names no query',
  $$INSERT INTO "AccreditationRequirement"(id,"accreditationId",label,source)
    VALUES ('ar1','acc1','Screening records complete','derived_screening')$$);
SELECT expect_success('derived evidence that says where to look',
  $$INSERT INTO "AccreditationRequirement"(id,"accreditationId",label,source,"derivedFrom")
    VALUES ('ar2','acc1','Screening records complete','derived_screening',
            'ScreeningFile where status = full_screening_complete, last 12 months')$$);

-- ---------------------------------------------------------------------------
-- 11. Delegated roles
-- ---------------------------------------------------------------------------
-- A delegation covers an absence. Every assertion here is a case that would
-- otherwise produce a delegation that looks fine and quietly is not.

INSERT INTO "UserRole"(id,"userId",role,"grantedById") VALUES
  ('ur-fin','u3','finance_officer','u3'),
  ('ur-top','u1','top_management','u1');

SELECT expect_success('lend a role for two weeks',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg1','finance_officer','u3','u1',now() + interval '14 days',
            'Annual leave','u3')$$);

SELECT expect_failure('a delegation with no end date',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId",reason,"grantedByUserId")
    VALUES ('dg2','finance_officer','u3','u1','Open-ended','u3')$$);
SELECT expect_failure('a delegation that ends before it starts',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","startsAt","endsAt",reason,"grantedByUserId")
    VALUES ('dg3','top_management','u1','u3',now(),now() - interval '1 day','Backwards','u1')$$);
SELECT expect_failure('a delegation running longer than 90 days',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg4','top_management','u1','u3',now() + interval '120 days','Sabbatical','u1')$$);
SELECT expect_failure('lending a role to yourself',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg5','top_management','u1','u1',now() + interval '7 days','Mine anyway','u1')$$);
SELECT expect_failure('arranging your own cover',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg6','top_management','u1','u3',now() + interval '7 days','I will take it','u3')$$);
SELECT expect_failure('lending a role nobody holds',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg7','control','u3','u1',now() + interval '7 days','Not theirs to lend','u3')$$);
SELECT expect_failure('two live delegations of the same role to the same person',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg8','finance_officer','u3','u1',now() + interval '20 days','Again','u3')$$);
SELECT expect_failure('half a revocation — ended with no reason',
  $$UPDATE "RoleDelegation" SET "revokedAt" = now() WHERE id = 'dg1'$$);
SELECT expect_success('take a delegation back, whole',
  $$UPDATE "RoleDelegation"
    SET "revokedAt" = now(), "revokedByUserId" = 'u3', "revokedReason" = 'Back early'
    WHERE id = 'dg1'$$);
-- Once the first is revoked the same role may be lent again, which is what
-- makes the partial index right rather than merely strict.
SELECT expect_success('lend it again once the first is taken back',
  $$INSERT INTO "RoleDelegation"(id,role,"fromUserId","toUserId","endsAt",reason,"grantedByUserId")
    VALUES ('dg9','finance_officer','u3','u1',now() + interval '10 days','Leave again','u3')$$);

-- ---------------------------------------------------------------------------
-- 12. The no-signal handover
-- ---------------------------------------------------------------------------
-- A transfer of responsibility for a lone officer. Recorded whole, in order,
-- and only on a post that actually has no signal.

INSERT INTO "Post"(id,"siteId",name,"mobileSignal") VALUES ('post-nosig','s1','Far perimeter',false);
INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt",state) VALUES
  ('a-nosig','p1','post-nosig',now() - interval '2 hours',now() + interval '10 hours','published'),
  ('a-signal','p2','post1',now() - interval '2 hours',now() + interval '10 hours','published');

SELECT expect_success('hand a no-signal post over to the client',
  $$INSERT INTO "NoSignalHandover"(id,"assignmentId","notifiedAt","notifiedContact")
    VALUES ('ns1','a-nosig',now() - interval '100 minutes','Site duty manager')$$);

SELECT expect_failure('a handover on a post that HAS a signal',
  $$INSERT INTO "NoSignalHandover"(id,"assignmentId","notifiedAt","notifiedContact")
    VALUES ('ns2','a-signal',now(),'Someone')$$);
SELECT expect_failure('notified, but nobody recorded as told',
  $$UPDATE "NoSignalHandover" SET "notifiedContact" = NULL WHERE id = 'ns1'$$);
SELECT expect_failure('the client losing contact before they were given it',
  $$UPDATE "NoSignalHandover"
    SET "lossReportedAt" = now() - interval '3 hours', "lossReportedBy" = 'Duty manager'
    WHERE id = 'ns1'$$);
SELECT expect_failure('a loss report with nobody reporting it',
  $$UPDATE "NoSignalHandover" SET "lossReportedAt" = now() WHERE id = 'ns1'$$);
SELECT expect_success('the client reports losing contact, properly recorded',
  $$UPDATE "NoSignalHandover"
    SET "lossReportedAt" = now(), "lossReportedBy" = 'Site duty manager',
        "lossDetail" = 'No answer on the site phone for 40 minutes'
    WHERE id = 'ns1'$$);
SELECT expect_failure('two handovers for one shift',
  $$INSERT INTO "NoSignalHandover"(id,"assignmentId","notifiedAt","notifiedContact")
    VALUES ('ns3','a-nosig',now(),'Someone else')$$);

-- ---------------------------------------------------------------------------
-- 13. Screening exceptions
-- ---------------------------------------------------------------------------
-- The cases a senior person decides. Each shape the standard rules out is
-- tried here against file f4.

SELECT expect_failure('an extension of three weeks',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById",weeks)
    VALUES ('x1','f4','extension','awaiting_decision','Referee not replying','u1',3)$$);
SELECT expect_success('the single four-week extension, requested',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById",weeks)
    VALUES ('x2','f4','extension','awaiting_decision','Two written requests, no reply','u1',4)$$);
SELECT expect_failure('a second extension request while the first is open',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById",weeks)
    VALUES ('x3','f4','extension','awaiting_decision','Asking again','u1',4)$$);
SELECT expect_failure('weeks on something that is not an extension',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById",weeks)
    VALUES ('x4','f4','adverse_finding','awaiting_representation','Reference contradicts dates','u1',4)$$);

SELECT expect_failure('a statutory declaration over six months',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById","periodFrom","periodTo")
    VALUES ('x5','f4','statutory_declaration','awaiting_decision','Employer dissolved','u1','2024-01-01','2024-08-01')$$);
SELECT expect_failure('a statutory declaration with no period',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById")
    VALUES ('x6','f4','statutory_declaration','awaiting_decision','Employer dissolved','u1')$$);
SELECT expect_success('a statutory declaration for five months',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById","periodFrom","periodTo")
    VALUES ('x7','f4','statutory_declaration','awaiting_decision','Employer dissolved','u1','2024-01-01','2024-06-01')$$);

SELECT expect_failure('a CCJ of £9,000 treated as needing acceptance',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById",trigger,"amountGbp")
    VALUES ('x8','f4','risk_finding','awaiting_representation','CCJ found','u1','ccj',9000)$$);
SELECT expect_success('a CCJ of £14,200 raised for acceptance',
  $$INSERT INTO "ScreeningException"(id,"fileId",kind,state,detail,"raisedById",trigger,"amountGbp")
    VALUES ('x9','f4','risk_finding','awaiting_representation','CCJ found','u1','ccj',14200)$$);
SELECT expect_failure('decided with no signed decision',
  $$UPDATE "ScreeningException" SET state = 'decided' WHERE id = 'x9'$$);
SELECT expect_failure('a representation with nobody recording it',
  $$UPDATE "ScreeningException" SET "representationRecordedAt" = now() WHERE id = 'x9'$$);

SELECT expect_failure('a risk that is "approved" rather than accepted',
  $$INSERT INTO "ScreeningDecision"(id,"fileId",kind,"decidedById",rationale,outcome)
    VALUES ('sd1','f4','risk_acceptance','u3','Satisfied in full, unrelated to the role','approved')$$);
SELECT expect_failure('a decision with no grounds',
  $$INSERT INTO "ScreeningDecision"(id,"fileId",kind,"decidedById",rationale,outcome)
    VALUES ('sd2','f4','risk_acceptance','u3','ok','accepted')$$);
SELECT expect_success('a risk accepted, with grounds',
  $$INSERT INTO "ScreeningDecision"(id,"fileId",kind,"decidedById",rationale,outcome)
    VALUES ('sd3','f4','risk_acceptance','u3','Satisfied in full 18 months ago, unrelated to the role','accepted')$$);

-- ---------------------------------------------------------------------------
-- 14. Career and history periods
-- ---------------------------------------------------------------------------

SELECT expect_success('an employment period, as stated',
  $$INSERT INTO "HistoryPeriod"(id,"fileId",kind,organisation,"statedFrom","statedTo")
    VALUES ('h1','f4','employment','Brightwater Security','2022-01-01','2024-06-30')$$);
SELECT expect_failure('a period that ends before it starts',
  $$INSERT INTO "HistoryPeriod"(id,"fileId",kind,"statedFrom","statedTo")
    VALUES ('h2','f4','employment','2024-01-01','2023-01-01')$$);
SELECT expect_failure('a current job with an end date',
  $$INSERT INTO "HistoryPeriod"(id,"fileId",kind,"statedFrom","statedTo","isCurrent")
    VALUES ('h3','f4','employment','2024-07-01','2025-01-01',true)$$);
SELECT expect_success('a current job, still going',
  $$INSERT INTO "HistoryPeriod"(id,"fileId",kind,organisation,"statedFrom","isCurrent")
    VALUES ('h4','f4','employment','Apex Facilities','2024-07-01',true)$$);
SELECT expect_failure('approaching a current employer without permission (7.7b)',
  $$UPDATE "HistoryPeriod" SET "firstRequestAt" = now(), "contactVerifiedHow" = 'Companies House listing'
    WHERE id = 'h4'$$);
SELECT expect_failure('a reference request with no record of how the contact was found (7.5.2a)',
  $$UPDATE "HistoryPeriod" SET "firstRequestAt" = now() WHERE id = 'h1'$$);
SELECT expect_success('a reference request, contact established independently',
  $$UPDATE "HistoryPeriod" SET "firstRequestAt" = now() - interval '14 days',
      "contactVerifiedHow" = 'Switchboard number from the company website, not the candidate' WHERE id = 'h1'$$);
SELECT expect_failure('a second request before the first',
  $$UPDATE "HistoryPeriod" SET "secondRequestAt" = now() - interval '20 days' WHERE id = 'h1'$$);
SELECT expect_failure('verified with nobody named',
  $$UPDATE "HistoryPeriod" SET method = 'reference', "verifiedAt" = now() WHERE id = 'h1'$$);
SELECT expect_failure('documentary evidence that is two of the same document',
  $$UPDATE "HistoryPeriod" SET method = 'documentary', "verifiedAt" = now(), "verifiedById" = 'u3',
      "documentStart" = 'Payslip', "documentEnd" = 'payslip' WHERE id = 'h1'$$);
SELECT expect_success('documentary evidence: a payslip and a P60',
  $$UPDATE "HistoryPeriod" SET method = 'documentary', "verifiedAt" = now(), "verifiedById" = 'u3',
      "documentStart" = 'Payslip', "documentEnd" = 'P60' WHERE id = 'h1'$$);

-- ---------------------------------------------------------------------------
-- 15. Uploaded documents
-- ---------------------------------------------------------------------------

SELECT expect_success('an SIA licence scan on a screening file',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId",verification,"storageKey","fileName","mimeType","sizeBytes",sha256)
    VALUES ('up1','sia','f4','supplied','screening/f4/up1.pdf','licence.pdf','application/pdf',48213,'ab12')$$);
SELECT expect_failure('a copy with no checksum',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId","storageKey","fileName","mimeType","sizeBytes")
    VALUES ('up2','sia','f4','screening/f4/up2.pdf','licence.pdf','application/pdf',48213)$$);
SELECT expect_failure('a described copy stored nowhere',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId","fileName","mimeType","sizeBytes",sha256)
    VALUES ('up3','sia','f4','licence.pdf','application/pdf',48213,'ab12')$$);
SELECT expect_failure('an executable uploaded as a document',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId","storageKey","fileName","mimeType","sizeBytes",sha256)
    VALUES ('up4','sia','f4','screening/f4/up4','run.exe','application/x-msdownload',48213,'ab12')$$);
SELECT expect_failure('a file over 10 MB',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId","storageKey","fileName","mimeType","sizeBytes",sha256)
    VALUES ('up5','sia','f4','screening/f4/up5.pdf','big.pdf','application/pdf',20000000,'ab12')$$);
SELECT expect_failure('an original "seen" by nobody',
  $$UPDATE "DocumentRecord" SET "originalSeenAt" = now() WHERE id = 'up1'$$);
SELECT expect_failure('a copy of a criminality certificate kept anyway (7.7j)',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId","storageKey","fileName","mimeType","sizeBytes",sha256)
    VALUES ('up6','crc','f4','screening/f4/up6.pdf','dbs.pdf','application/pdf',48213,'ab12')$$);
SELECT expect_success('the criminality outcome recorded without a copy',
  $$INSERT INTO "DocumentRecord"(id,"typeId","screeningFileId",verification,outcome)
    VALUES ('up7','crc','f4','verified','Basic disclosure: no convictions shown')$$);

-- ---------------------------------------------------------------------------
-- 16. Client requirements
-- ---------------------------------------------------------------------------

SELECT expect_success('raise a requirement for two officers',
  $$INSERT INTO "Requirement"(id,reference,"clientId","siteId",post,"headcountRequired","startDate")
    VALUES ('rq1','REQ-9001','c1','s1','Gatehouse',2,'2026-10-01')$$);
SELECT expect_failure('a requirement for nobody',
  $$INSERT INTO "Requirement"(id,reference,"clientId","siteId",post,"headcountRequired","startDate")
    VALUES ('rq2','REQ-9002','c1','s1','Gatehouse',0,'2026-10-01')$$);
SELECT expect_failure('cancelled without a reason',
  $$UPDATE "Requirement" SET status = 'cancelled' WHERE id = 'rq1'$$);
SELECT expect_success('allocate an officer from the pool',
  $$INSERT INTO "RequirementAllocation"(id,"requirementId","personId",source,"allocatedById")
    VALUES ('al1','rq1','p1','pool','u3')$$);
SELECT expect_failure('the same officer allocated twice',
  $$INSERT INTO "RequirementAllocation"(id,"requirementId","personId",source,"allocatedById")
    VALUES ('al2','rq1','p1','pool','u3')$$);
SELECT expect_failure('a recruited allocation with no candidacy',
  $$INSERT INTO "RequirementAllocation"(id,"requirementId","personId",source,"allocatedById")
    VALUES ('al3','rq1','p2','recruited','u3')$$);
SELECT expect_failure('taken off with no reason',
  $$UPDATE "RequirementAllocation" SET "releasedAt" = now() WHERE id = 'al1'$$);
SELECT expect_success('taken off, with the reason',
  $$UPDATE "RequirementAllocation" SET "releasedAt" = now(), "releasedReason" = 'Client asked for someone else' WHERE id = 'al1'$$);
SELECT expect_success('once taken off, allocated again',
  $$INSERT INTO "RequirementAllocation"(id,"requirementId","personId",source,"allocatedById")
    VALUES ('al4','rq1','p1','pool','u3')$$);

-- ---------------------------------------------------------------------------
-- 17. Building the rota
-- ---------------------------------------------------------------------------

INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt") VALUES
  ('ra1','p2','post2','2026-10-08 19:00+01','2026-10-09 07:00+01'),
  ('ra2','p2','post2','2026-10-09 19:00+01','2026-10-10 07:00+01');

SELECT expect_success('a yes that names the draft it made',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,"assignmentId")
    VALUES ('sa1','p2','post2','2026-10-08 19:00+01','2026-10-09 07:00+01','u3','phone','yes','ra1')$$);
SELECT expect_failure('a yes that put nobody on the rota',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer)
    VALUES ('sa2','p2','post2','2026-10-09 19:00+01','2026-10-10 07:00+01','u3','phone','yes')$$);
SELECT expect_failure('a no that names a shift',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,"assignmentId")
    VALUES ('sa3','p2','post2','2026-10-09 19:00+01','2026-10-10 07:00+01','u3','phone','no','ra2')$$);
SELECT expect_failure('a yes naming another officer''s shift',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,"assignmentId")
    VALUES ('sa4','p1','post2','2026-10-09 19:00+01','2026-10-10 07:00+01','u3','phone','yes','ra2')$$);
SELECT expect_failure('a yes naming a shift with other hours',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,"assignmentId")
    VALUES ('sa5','p2','post2','2026-10-09 18:00+01','2026-10-10 06:00+01','u3','phone','yes','ra2')$$);
SELECT expect_failure('two yeses for one shift',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,"assignmentId")
    VALUES ('sa6','p2','post2','2026-10-08 19:00+01','2026-10-09 07:00+01','u3','whatsapp','yes','ra1')$$);
SELECT expect_failure('asked about a shift that ends before it starts',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer)
    VALUES ('sa7','p1','post2','2026-10-09 19:00+01','2026-10-09 07:00+01','u3','phone','no')$$);
SELECT expect_success('no answer is recorded too',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,note)
    VALUES ('sa8','p1','post2','2026-10-09 19:00+01','2026-10-10 07:00+01','u3','phone','no_answer','Left a voicemail')$$);
SELECT expect_success('the yes that follows it, naming its draft',
  $$INSERT INTO "ShiftAsk"(id,"personId","postId","startsAt","endsAt","askedById",channel,answer,"assignmentId")
    VALUES ('sa9','p2','post2','2026-10-09 19:00+01','2026-10-10 07:00+01','u3','sms','yes','ra2')$$);
SELECT expect_success('a post with a regular officer',
  $$UPDATE "Post" SET "regularPersonId" = 'p2' WHERE id = 'post2'$$);

-- ---------------------------------------------------------------------------
-- 18. Changing the rota on the night
-- ---------------------------------------------------------------------------

SELECT expect_failure('a working week of 0 hours',
  $$UPDATE "Employment" SET "weeklyHours" = 0 WHERE id = 'e1'$$);
SELECT expect_failure('a working week of 200 hours',
  $$UPDATE "Employment" SET "weeklyHours" = 200 WHERE id = 'e1'$$);
SELECT expect_success('a 60-hour agreed week',
  $$UPDATE "Employment" SET "weeklyHours" = 60 WHERE id = 'e1'$$);

-- p2 comes off ra1 (8 Oct night); p1 covers it.
UPDATE "Assignment" SET state = 'cancelled' WHERE id = 'ra1';
INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt",state) VALUES
  ('rc1','p1','post2','2026-10-08 19:00+01','2026-10-09 07:00+01','published'),
  ('rc2','p1','post1','2026-10-08 19:00+01','2026-10-09 07:00+01','cancelled');

SELECT expect_success('an officer comes off; the shift needs cover',
  $$INSERT INTO "CoverNeed"(id,"postId","startsAt","endsAt",reason,"fromAssignmentId","raisedById")
    VALUES ('cn1','post2','2026-10-08 19:00+01','2026-10-09 07:00+01','sick','ra1','u3')$$);
SELECT expect_failure('a second cover need for the same shift',
  $$INSERT INTO "CoverNeed"(id,"postId","startsAt","endsAt",reason,"fromAssignmentId","raisedById")
    VALUES ('cn2','post2','2026-10-08 19:00+01','2026-10-09 07:00+01','sick','ra1','u3')$$);
SELECT expect_failure('covered with no time recorded',
  $$UPDATE "CoverNeed" SET "coverAssignmentId" = 'rc1' WHERE id = 'cn1'$$);
SELECT expect_failure('covered by a shift on another post',
  $$UPDATE "CoverNeed" SET "coverAssignmentId" = 'rc2', "coveredAt" = now() WHERE id = 'cn1'$$);
SELECT expect_failure('left uncovered without saying why',
  $$UPDATE "CoverNeed" SET "closedAt" = now(), "closedById" = 'u3' WHERE id = 'cn1'$$);
SELECT expect_success('covered by the right shift',
  $$UPDATE "CoverNeed" SET "coverAssignmentId" = 'rc1', "coveredAt" = now() WHERE id = 'cn1'$$);
SELECT expect_failure('covered and left uncovered at once',
  $$UPDATE "CoverNeed" SET "closedAt" = now(), "closedReason" = 'Client told', "closedById" = 'u3' WHERE id = 'cn1'$$);

-- p2 comes off ra2 part-way; nobody is found.
UPDATE "Assignment" SET "endsAt" = '2026-10-09 23:00+01', state = 'amended' WHERE id = 'ra2';
SELECT expect_failure('cover that finishes before the shift did',
  $$INSERT INTO "CoverNeed"(id,"postId","startsAt","endsAt",reason,"fromAssignmentId","raisedById")
    VALUES ('cn3','post2','2026-10-10 07:00+01','2026-10-09 23:00+01','sick','ra2','u3')$$);
SELECT expect_success('the rest of a shift needs cover',
  $$INSERT INTO "CoverNeed"(id,"postId","startsAt","endsAt",reason,"fromAssignmentId","raisedById")
    VALUES ('cn4','post2','2026-10-09 23:00+01','2026-10-10 07:00+01','withdrew','ra2','u3')$$);
SELECT expect_failure('covered by the officer who came off',
  $$WITH c AS (INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt",state)
      VALUES ('rc3','p2','post2','2026-10-09 23:30+01','2026-10-10 07:00+01','published') RETURNING id)
    UPDATE "CoverNeed" SET "coverAssignmentId" = (SELECT id FROM c), "coveredAt" = now() WHERE id = 'cn4'$$);
SELECT expect_success('left uncovered, with the reason',
  $$UPDATE "CoverNeed" SET "closedAt" = now(), "closedReason" = 'Client told 23:10; post unmanned until 07:00', "closedById" = 'u3' WHERE id = 'cn4'$$);

-- ---------------------------------------------------------------------------
-- 19. Open shifts
-- ---------------------------------------------------------------------------

SELECT expect_success('an open shift on the rota',
  $$INSERT INTO "OpenShift"(id,"postId","startsAt","endsAt","createdById")
    VALUES ('os1','post1','2026-10-12 09:00+01','2026-10-12 17:00+01','u3')$$);
SELECT expect_failure('the same post given overlapping hours twice',
  $$INSERT INTO "OpenShift"(id,"postId","startsAt","endsAt","createdById")
    VALUES ('os2','post1','2026-10-12 10:00+01','2026-10-12 18:00+01','u3')$$);
SELECT expect_success('the same hours on another post',
  $$INSERT INTO "OpenShift"(id,"postId","startsAt","endsAt","createdById")
    VALUES ('os3','post2','2026-10-12 09:00+01','2026-10-12 17:00+01','u3')$$);
SELECT expect_failure('an open shift that ends before it starts',
  $$INSERT INTO "OpenShift"(id,"postId","startsAt","endsAt","createdById")
    VALUES ('os4','post1','2026-10-13 17:00+01','2026-10-13 09:00+01','u3')$$);
SELECT expect_failure('removed without saying why',
  $$UPDATE "OpenShift" SET "cancelledAt" = now() WHERE id = 'os3'$$);

INSERT INTO "Assignment"(id,"personId","postId","startsAt","endsAt") VALUES
  ('rf1','p1','post1','2026-10-12 09:00+01','2026-10-12 17:00+01'),
  ('rf2','p2','post2','2026-10-12 09:00+01','2026-10-12 17:00+01');

SELECT expect_failure('filled by a shift on another post',
  $$UPDATE "OpenShift" SET "assignmentId" = 'rf2' WHERE id = 'os1'$$);
SELECT expect_success('filled by the officer put on it',
  $$UPDATE "OpenShift" SET "assignmentId" = 'rf1' WHERE id = 'os1'$$);
SELECT expect_failure('one assignment filling two open shifts',
  $$UPDATE "OpenShift" SET "assignmentId" = 'rf1' WHERE id = 'os3'$$);
SELECT expect_failure('a filled shift removed as if nobody were on it',
  $$UPDATE "OpenShift" SET "cancelledAt" = now(), "cancelledReason" = 'Not needed' WHERE id = 'os1'$$);
SELECT expect_success('an open shift removed, with the reason',
  $$UPDATE "OpenShift" SET "cancelledAt" = now(), "cancelledReason" = 'Created by mistake' WHERE id = 'os3'$$);
SELECT expect_success('a removed shift frees its hours for a new one',
  $$INSERT INTO "OpenShift"(id,"postId","startsAt","endsAt","createdById")
    VALUES ('os5','post2','2026-10-12 09:00+01','2026-10-12 17:00+01','u3')$$);

-- ---------------------------------------------------------------------------
-- 20. Chase-ups
-- ---------------------------------------------------------------------------

SELECT expect_success('a chase-up, confirmed by phone',
  $$INSERT INTO "ChaseUp"(id,"assignmentId",channel,outcome) VALUES ('cu1','rf1','phone','confirmed')$$);
SELECT expect_success('confirmed on the officer''s own channel, no Control channel',
  $$INSERT INTO "ChaseUp"(id,"assignmentId",outcome) VALUES ('cu2','rf1','confirmed')$$);
SELECT expect_failure('no answer that does not say how they were tried',
  $$INSERT INTO "ChaseUp"(id,"assignmentId",outcome) VALUES ('cu3','rf1','no_answer')$$);
SELECT expect_failure('cannot attend without saying why',
  $$INSERT INTO "ChaseUp"(id,"assignmentId",channel,outcome) VALUES ('cu4','rf1','phone','cannot_attend')$$);
SELECT expect_success('cannot attend, with what they said',
  $$INSERT INTO "ChaseUp"(id,"assignmentId",channel,outcome,note) VALUES ('cu5','rf1','whatsapp','cannot_attend','Rang in sick')$$);
