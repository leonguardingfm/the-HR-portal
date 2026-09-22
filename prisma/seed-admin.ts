/**
 * Demonstration data for the Admin department.
 *
 * Kept in its own module and called from seed.ts, for the same reason the rest
 * of the seed is split: the configuration half reads lib/core so there is one
 * source of truth for the rules, and the demonstration half is obviously
 * demonstration. Nothing here is a fact about the business.
 *
 * The rows are chosen to exercise the cases that are easy to get wrong:
 *   - a payment matching its agreed figure, and one that does not
 *   - a request on each rung of the approval ladder, including one over the
 *     high threshold with two distinct approvers
 *   - a penalty against a member of staff, which needs HR and higher
 *     management as well as the money rung
 *   - an accreditation whose evidence is mostly assembled from records the
 *     platform already holds
 *   - stock at its reorder level, and kit still out with a leaver
 */

import { PrismaClient } from "@prisma/client";
import {
  ADMIN_REMINDER_RULES,
  ADMIN_ROUTINES,
  APPROVAL_SETTING_KEYS,
  DEFAULT_THRESHOLDS,
  PRIORITIES,
  approvalChain,
} from "../lib/core/admin";
import type { Role } from "../lib/types";

const day = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * day);
const daysAhead = (n: number) => new Date(Date.now() + n * day);

/**
 * Tables the Admin migration added, in delete order.
 *
 * WorkItem comes FIRST, before AdminItem, and that is not cosmetic.
 * `WorkItem.adminItemId` is an optional relation, so deleting an AdminItem sets
 * it to null — and `work_item_one_subject` then refuses the row, because a work
 * item with no subject is a queue entry about nothing. Exactly the same trap as
 * Event and User, documented in seed.ts. The constraint is right; the delete
 * order is what has to change.
 */
export const ADMIN_TABLES = [
  "RoleDelegation",
  "WorkItem",
  "AdminApproval",
  "AdminItem",
  "StockMovement",
  "StockItem",
  "AccreditationRequirement",
  "AccreditationSubmission",
  "Accreditation",
  "Voucher",
  "Penalty",
  "Suspension",
  "AuthorityMatter",
  "HolidayRequest",
  "HolidayEntitlement",
  "MaintenanceJob",
  "Asset",
  "PaymentInstance",
  "RecurringPayment",
  "SupplierContract",
  "Supplier",
  "EquipmentIssue",
  "EquipmentItem",
];

export async function seedAdminConfiguration(db: PrismaClient) {
  // The thresholds. Settings, not constants, so changing them is an edit with
  // an event against it rather than a release.
  await db.setting.createMany({
    data: [
      {
        key: APPROVAL_SETTING_KEYS.low,
        value: String(DEFAULT_THRESHOLDS.lowPence),
        valueType: "number",
        label: "Admin approval — the Admin Manager decides alone at or under this",
        usedBy: "lib/core/admin.ts approvalChain",
      },
      {
        key: APPROVAL_SETTING_KEYS.high,
        value: String(DEFAULT_THRESHOLDS.highPence),
        valueType: "number",
        label: "Admin approval — a second, different approver is required above this",
        usedBy: "lib/core/admin.ts approvalChain",
      },
    ],
    skipDuplicates: true,
  });

  // The reminder rules, read from lib/core so the screen that lists them and
  // the scheduler that runs them cannot describe different rules.
  await db.reminderRule.createMany({
    data: ADMIN_REMINDER_RULES.map((r) => ({
      key: r.key,
      label: r.label,
      subject: r.subject,
      offsets: r.offsets,
      escalatesTo: r.escalatesTo as Role | null,
    })),
    skipDuplicates: true,
  });

  // The repeating Admin jobs, configured once rather than re-created by hand.
  await db.workItemDefinition.createMany({
    data: ADMIN_ROUTINES.map((r) => ({
      id: r.key,
      title: r.title,
      department: "administration" as const,
      recurrence: r.recurrence,
      slaDays: Math.max(1, Math.round(PRIORITIES[r.priority].targetHours / 24)),
      ownerRole: r.ownerRole as Role,
      escalatesTo: "admin_manager" as Role,
    })),
    skipDuplicates: true,
  });
}

export async function seedAdminDemonstration(
  db: PrismaClient,
  userId: (name: string) => string,
  personIdByName: (name: string) => string | null,
) {
  const sana = userId("Sana");
  const bilal = userId("Bilal");
  const imran = userId("Imran");
  const farhan = userId("Farhan");

  // --- Payments & contracts ------------------------------------------------

  await db.supplier.createMany({
    data: [
      { id: "sup-landlord", name: "Brockley Estates", category: "premises", accountRef: "BE-4471", paymentTermsDays: 0 },
      { id: "sup-utilities", name: "Northern Power", category: "utilities", accountRef: "NP-90112", paymentTermsDays: 14 },
      { id: "sup-telecoms", name: "Linehaul Telecom", category: "telecoms", accountRef: "LT-2208", paymentTermsDays: 30 },
      { id: "sup-uniform", name: "Sentinel Workwear", category: "uniform", accountRef: "SW-1190", paymentTermsDays: 30 },
      { id: "sup-facilities", name: "Kestrel Facilities", category: "maintenance", accountRef: "KF-0043", paymentTermsDays: 30 },
    ],
  });

  await db.supplierContract.createMany({
    data: [
      {
        supplierId: "sup-landlord",
        reference: "Office lease — Unit 4",
        startsOn: daysAgo(540),
        endsOn: daysAhead(190),
        noticePeriodDays: 90,
        agreedAmountPence: 180_000,
        notes: "Three-year lease. Rent reviewed annually in April.",
      },
      {
        supplierId: "sup-telecoms",
        reference: "Lines and broadband",
        startsOn: daysAgo(400),
        // Inside the notice period already — the case the screen exists to
        // catch, because a contract that rolls on costs the same as one nobody
        // read.
        endsOn: daysAhead(25),
        noticePeriodDays: 30,
        agreedAmountPence: 14_900,
      },
      {
        supplierId: "sup-facilities",
        reference: "Cleaning and waste",
        startsOn: daysAgo(200),
        endsOn: daysAhead(520),
        noticePeriodDays: 60,
        agreedAmountPence: 42_000,
      },
    ],
  });

  await db.recurringPayment.createMany({
    data: [
      { id: "rp-rent", supplierId: "sup-landlord", label: "Office rent — Unit 4", agreedAmountPence: 180_000, frequency: "monthly", dayOfMonth: 1, firstDueOn: daysAgo(540) },
      { id: "rp-power", supplierId: "sup-utilities", label: "Electricity and gas", agreedAmountPence: 38_500, frequency: "monthly", dayOfMonth: 14, firstDueOn: daysAgo(400) },
      { id: "rp-lines", supplierId: "sup-telecoms", label: "Lines and broadband", agreedAmountPence: 14_900, frequency: "monthly", dayOfMonth: 20, firstDueOn: daysAgo(400) },
      { id: "rp-clean", supplierId: "sup-facilities", label: "Cleaning and waste", agreedAmountPence: 42_000, frequency: "quarterly", dayOfMonth: 5, firstDueOn: daysAgo(200) },
    ],
  });

  await db.paymentInstance.createMany({
    data: [
      // Settled, matching the agreed figure. The normal case, and the one that
      // needs nobody's approval.
      { recurringPaymentId: "rp-rent", dueOn: daysAgo(62), amountDuePence: 180_000, paidOn: daysAgo(63), amountPaidPence: 180_000, reference: "BACS 8841" },
      { recurringPaymentId: "rp-rent", dueOn: daysAgo(32), amountDuePence: 180_000, paidOn: daysAgo(33), amountPaidPence: 180_000, reference: "BACS 8902" },
      // Due, unpaid.
      { recurringPaymentId: "rp-rent", dueOn: daysAhead(6), amountDuePence: 180_000 },
      // Paid over the agreed figure — this is what a variance looks like once
      // it has been through the chain.
      { recurringPaymentId: "rp-power", dueOn: daysAgo(20), amountDuePence: 38_500, paidOn: daysAgo(19), amountPaidPence: 51_200, reference: "DD Sept" },
      { recurringPaymentId: "rp-power", dueOn: daysAhead(9), amountDuePence: 38_500 },
      // Overdue and unpaid. The tile that should be red.
      { recurringPaymentId: "rp-lines", dueOn: daysAgo(4), amountDuePence: 14_900 },
      { recurringPaymentId: "rp-clean", dueOn: daysAhead(12), amountDuePence: 42_000 },
    ],
  });

  // --- Premises & equipment ------------------------------------------------

  await db.asset.createMany({
    data: [
      { id: "as-boiler", tag: "AST-001", label: "Gas boiler", category: "heating", location: "Plant room", supplierId: "sup-facilities", purchasedOn: daysAgo(900), purchaseCostPence: 245_000, serviceIntervalMonths: 12, lastServicedOn: daysAgo(380), nextServiceOn: daysAgo(15), condition: "needs_attention" },
      { id: "as-alarm", tag: "AST-002", label: "Intruder alarm panel", category: "security", location: "Reception", purchasedOn: daysAgo(700), purchaseCostPence: 89_000, serviceIntervalMonths: 6, lastServicedOn: daysAgo(170), nextServiceOn: daysAhead(11) },
      { id: "as-printer", tag: "AST-003", label: "Multifunction printer", category: "office", location: "Admin office", purchasedOn: daysAgo(300), purchaseCostPence: 62_000, warrantyEndsOn: daysAhead(430), serviceIntervalMonths: 12, nextServiceOn: daysAhead(65) },
      { id: "as-kettle", tag: "AST-004", label: "Water boiler", category: "kitchen", location: "Kitchen", purchasedOn: daysAgo(120), purchaseCostPence: 18_000, condition: "out_of_service" },
      { id: "as-server", tag: "AST-005", label: "Control room UPS", category: "it", location: "Control room", purchasedOn: daysAgo(500), purchaseCostPence: 134_000, serviceIntervalMonths: 12, lastServicedOn: daysAgo(200), nextServiceOn: daysAhead(165) },
    ],
  });

  await db.maintenanceJob.createMany({
    data: [
      { assetId: "as-boiler", kind: "service", description: "Annual service and gas safety check", reportedAt: daysAgo(380), supplierId: "sup-facilities", costPence: 21_000, completedAt: daysAgo(378), outcome: "Passed. Flue seal replaced." },
      { assetId: "as-kettle", kind: "repair", description: "Element failed, no hot water", reportedAt: daysAgo(6), reportedByUserId: sana },
      { assetId: "as-alarm", kind: "inspection", description: "Six-monthly inspection", reportedAt: daysAgo(170), completedAt: daysAgo(170), outcome: "No faults." },
    ],
  });

  // --- People admin --------------------------------------------------------

  const leaveYearStart = new Date(new Date().getFullYear(), 0, 1);
  const leaveYearEnd = new Date(new Date().getFullYear(), 11, 31);

  const withEntitlement = ["Sana", "Bilal", "Ahmed", "Usman", "Anas"]
    .map((n) => ({ name: n, personId: personIdByName(n) }))
    .filter((p): p is { name: string; personId: string } => p.personId !== null);

  await db.holidayEntitlement.createMany({
    data: withEntitlement.map((p, i) => ({
      id: `hol-ent-${i}`,
      personId: p.personId,
      leaveYearStart,
      leaveYearEnd,
      // Hours, not days: a shift is eight hours or twelve depending on the
      // post, so a day of leave is not a fixed quantity.
      entitlementHours: 224,
      carriedOverHours: i === 0 ? 16 : 0,
      basis: i === 0 ? "Statutory, plus 16 hours carried over with approval" : "Statutory 28 days at 8 hours",
    })),
    skipDuplicates: true,
  });

  const entitlements = await db.holidayEntitlement.findMany();
  const entitlementFor = (personId: string) =>
    entitlements.find((e) => e.personId === personId)?.id ?? null;

  if (withEntitlement[0]) {
    const p = withEntitlement[0];
    await db.holidayRequest.createMany({
      data: [
        // Waiting longer than five days — the KPI with a small watch band.
        {
          personId: p.personId,
          entitlementId: entitlementFor(p.personId),
          startsOn: daysAhead(30),
          endsOn: daysAhead(37),
          hoursRequested: 48,
          raisedAt: daysAgo(8),
        },
        // Already approved, with the cover count recorded at the time.
        {
          personId: p.personId,
          entitlementId: entitlementFor(p.personId),
          startsOn: daysAgo(60),
          endsOn: daysAgo(53),
          hoursRequested: 40,
          decision: "approved",
          raisedAt: daysAgo(80),
          decidedAt: daysAgo(78),
          decidedByUserId: bilal,
          shiftsAffected: 0,
          note: "No rostered shifts in that window.",
        },
      ],
    });
  }
  if (withEntitlement[1]) {
    await db.holidayRequest.create({
      data: {
        personId: withEntitlement[1].personId,
        entitlementId: entitlementFor(withEntitlement[1].personId),
        startsOn: daysAhead(12),
        endsOn: daysAhead(16),
        hoursRequested: 32,
        raisedAt: daysAgo(2),
      },
    });
  }

  const officerPerson = personIdByName("Rashid Mahmood") ?? withEntitlement[2]?.personId ?? null;

  await db.authorityMatter.createMany({
    data: [
      {
        reference: "AUT-0001",
        body: "dwp",
        matterType: "Earnings enquiry",
        personId: officerPerson,
        receivedOn: daysAgo(9),
        dueOn: daysAhead(5),
        state: "open",
        summary:
          "Written request for earnings and hours over the last six months. Response goes out under the HR Manager's signature.",
      },
      {
        reference: "AUT-0002",
        body: "hmrc",
        matterType: "PAYE coding query",
        receivedOn: daysAgo(30),
        dueOn: daysAgo(2),
        state: "awaiting_response",
        summary: "Coding notice query on two employees. Overdue — chased twice.",
      },
      {
        reference: "AUT-0003",
        body: "dwp",
        matterType: "Benefit verification",
        receivedOn: daysAgo(90),
        respondedOn: daysAgo(85),
        closedOn: daysAgo(80),
        state: "closed",
        summary: "Verification of employment dates. Answered and closed.",
      },
    ],
  });

  if (officerPerson) {
    await db.suspension.create({
      data: {
        personId: officerPerson,
        startsOn: daysAgo(12),
        reason: "Pending the outcome of a site incident investigation.",
        paid: true,
        decidedByUserId: farhan,
      },
    });
  }

  // --- Penalties & decisions ----------------------------------------------

  if (officerPerson) {
    await db.penalty.createMany({
      data: [
        { reference: "PEN-0001", personId: officerPerson, kind: "recharge", amountPence: 4_500, grounds: "Site key not returned after a shift change; replacement lock barrel.", state: "approved", raisedAt: daysAgo(20) },
        { reference: "PEN-0002", personId: officerPerson, kind: "fine", amountPence: 12_000, grounds: "Parking penalty incurred in a company vehicle.", state: "raised", raisedAt: daysAgo(3) },
        { reference: "PEN-0003", personId: officerPerson, kind: "deduction", amountPence: 2_500, grounds: "Uniform not returned on leaving.", state: "written_off", raisedAt: daysAgo(200), writtenOffOn: daysAgo(120), writtenOffReason: "Uncollectable — the cost of recovery exceeded the value." },
      ],
    });
  }

  await db.voucher.createMany({
    data: [
      { reference: "VCH-0001", personId: personIdByName("Sana"), valuePence: 5_000, purpose: "Officer of the month", issuedOn: daysAgo(40), expiresOn: daysAhead(20), state: "issued" },
      { reference: "VCH-0002", personId: personIdByName("Ahmed"), valuePence: 2_500, purpose: "Referral bonus", issuedOn: daysAgo(100), expiresOn: daysAgo(10), state: "redeemed", redeemedOn: daysAgo(30) },
      { reference: "VCH-0003", valuePence: 10_000, purpose: "Client goodwill after a cover failure", issuedOn: daysAgo(15), expiresOn: daysAhead(75), state: "issued" },
    ],
  });

  // --- Uniform & stock -----------------------------------------------------

  await db.equipmentItem.createMany({
    data: [
      { id: "eq-trousers", category: "uniform", label: "Cargo trousers", returnable: false },
      { id: "eq-shirt", category: "uniform", label: "Long-sleeve shirt", returnable: false },
      { id: "eq-coat", category: "uniform", label: "Waterproof coat", returnable: true },
      { id: "eq-radio", category: "equipment", label: "Handheld radio", returnable: true },
      { id: "eq-boots", category: "ppe", label: "Safety boots", returnable: false },
    ],
  });

  await db.stockItem.createMany({
    data: [
      { id: "st-tr-32", equipmentItemId: "eq-trousers", size: "32R", reorderLevel: 6, location: "Store — shelf A" },
      { id: "st-tr-34", equipmentItemId: "eq-trousers", size: "34R", reorderLevel: 6, location: "Store — shelf A" },
      { id: "st-tr-36", equipmentItemId: "eq-trousers", size: "36R", reorderLevel: 6, location: "Store — shelf A" },
      { id: "st-sh-m", equipmentItemId: "eq-shirt", size: "M", reorderLevel: 8, location: "Store — shelf B" },
      { id: "st-sh-l", equipmentItemId: "eq-shirt", size: "L", reorderLevel: 8, location: "Store — shelf B" },
      { id: "st-coat-l", equipmentItemId: "eq-coat", size: "L", reorderLevel: 3, location: "Store — rail" },
      { id: "st-radio", equipmentItemId: "eq-radio", size: null, reorderLevel: 2, location: "Control room cabinet" },
      { id: "st-boots-9", equipmentItemId: "eq-boots", size: "9", reorderLevel: 4, location: "Store — shelf C" },
    ],
  });

  // Movements, not totals. On hand is the sum of these, so there is nothing
  // stored that could drift from what it claims to summarise.
  await db.stockMovement.createMany({
    data: [
      { stockItemId: "st-tr-32", kind: "received", quantity: 12, at: daysAgo(90), byUserId: sana },
      { stockItemId: "st-tr-32", kind: "issued", quantity: -4, at: daysAgo(60), byUserId: sana },
      { stockItemId: "st-tr-34", kind: "received", quantity: 18, at: daysAgo(90), byUserId: sana },
      { stockItemId: "st-tr-34", kind: "issued", quantity: -13, at: daysAgo(40), byUserId: sana },
      // Lands at the reorder level exactly, which is the boundary the screen
      // has to get right.
      { stockItemId: "st-tr-36", kind: "received", quantity: 10, at: daysAgo(90), byUserId: sana },
      { stockItemId: "st-tr-36", kind: "issued", quantity: -4, at: daysAgo(30), byUserId: sana },
      { stockItemId: "st-sh-m", kind: "received", quantity: 24, at: daysAgo(120), byUserId: sana },
      { stockItemId: "st-sh-m", kind: "issued", quantity: -9, at: daysAgo(50), byUserId: sana },
      { stockItemId: "st-sh-l", kind: "received", quantity: 20, at: daysAgo(120), byUserId: sana },
      { stockItemId: "st-sh-l", kind: "issued", quantity: -16, at: daysAgo(25), byUserId: sana },
      { stockItemId: "st-coat-l", kind: "received", quantity: 6, at: daysAgo(150), byUserId: sana },
      { stockItemId: "st-coat-l", kind: "issued", quantity: -5, at: daysAgo(20), byUserId: sana },
      { stockItemId: "st-coat-l", kind: "returned", quantity: 1, at: daysAgo(8), byUserId: sana, note: "Returned on leaving, good condition" },
      { stockItemId: "st-radio", kind: "received", quantity: 8, at: daysAgo(200), byUserId: sana },
      { stockItemId: "st-radio", kind: "issued", quantity: -7, at: daysAgo(100), byUserId: sana },
      { stockItemId: "st-boots-9", kind: "received", quantity: 10, at: daysAgo(110), byUserId: sana },
      { stockItemId: "st-boots-9", kind: "issued", quantity: -3, at: daysAgo(35), byUserId: sana },
      { stockItemId: "st-boots-9", kind: "written_off", quantity: -1, at: daysAgo(12), byUserId: sana, note: "Damaged in the store" },
    ],
  });

  // --- Accreditations ------------------------------------------------------

  await db.accreditation.createMany({
    data: [
      {
        id: "acc-acs",
        name: "SIA Approved Contractor Scheme",
        body: "Security Industry Authority",
        scope: "Security guarding and key holding",
        certificateNumber: "ACS-114872",
        firstAwardedOn: daysAgo(1200),
        expiresOn: daysAhead(75),
        nextAuditOn: daysAhead(40),
        state: "held",
        ownerRole: "top_management",
      },
      {
        id: "acc-9001",
        name: "ISO 9001:2015",
        body: "BSI",
        scope: "Provision of manned guarding services",
        certificateNumber: "FS-662104",
        firstAwardedOn: daysAgo(900),
        expiresOn: daysAhead(210),
        nextAuditOn: daysAhead(120),
        state: "held",
        ownerRole: "admin_manager",
      },
      {
        // Inside 30 days with nothing submitted: the KPI with no watch band
        // at all, and the row that should be red.
        id: "acc-safecontractor",
        name: "SafeContractor",
        body: "Alcumus",
        scope: "Health and safety competence",
        certificateNumber: "SC-77219",
        firstAwardedOn: daysAgo(740),
        expiresOn: daysAhead(22),
        state: "held",
        ownerRole: "admin_manager",
      },
    ],
  });

  await db.accreditationRequirement.createMany({
    data: [
      // The strongest de-duplication in the department: most of what an
      // accreditation asks for is work the platform already recorded.
      { accreditationId: "acc-acs", clause: "3.1", label: "Screening to BS 7858 for all operational staff", source: "derived_screening", derivedFrom: "ScreeningFile where status = full_screening_complete, all deployed officers" },
      { accreditationId: "acc-acs", clause: "3.2", label: "Licence checks current for all licensable staff", source: "derived_screening", derivedFrom: "Licence where kind = sia and expiresOn > today" },
      { accreditationId: "acc-acs", clause: "5.4", label: "Site inspections carried out to programme", source: "derived_quality", derivedFrom: "Inspection forms in the last 12 months, per site" },
      { accreditationId: "acc-acs", clause: "6.2", label: "Staff training records current", source: "derived_training", derivedFrom: "User.trainingReviewedAt within 12 months for screening roles" },
      { accreditationId: "acc-acs", clause: "7.1", label: "Current insurance certificate", source: "manual", satisfiedAt: daysAgo(30), satisfiedByUserId: bilal, note: "Employer's and public liability, renewed in August." },
      { accreditationId: "acc-acs", clause: "8.3", label: "Written complaints procedure, reviewed annually", source: "manual" },

      { accreditationId: "acc-9001", clause: "7.2", label: "Competence records for all staff", source: "derived_training", derivedFrom: "User.trainingReviewedAt, all active users" },
      { accreditationId: "acc-9001", clause: "9.1", label: "Client satisfaction monitoring", source: "derived_quality", derivedFrom: "Client feedback form responses, last 12 months" },
      { accreditationId: "acc-9001", clause: "10.2", label: "Corrective actions closed out", source: "derived_quality", derivedFrom: "Corrective-action work items, state = done" },
      { accreditationId: "acc-9001", clause: "6.1", label: "Risk register reviewed", source: "manual", satisfiedAt: daysAgo(60), satisfiedByUserId: bilal },

      { accreditationId: "acc-safecontractor", label: "Health and safety policy signed by a director", source: "manual", satisfiedAt: daysAgo(200), satisfiedByUserId: farhan },
      { accreditationId: "acc-safecontractor", label: "Accident and near-miss records", source: "derived_quality", derivedFrom: "Incident records, last 12 months" },
      { accreditationId: "acc-safecontractor", label: "Risk assessments for each site", source: "manual" },
      { accreditationId: "acc-safecontractor", label: "Training records for manual handling and lone working", source: "derived_training", derivedFrom: "Training records by course, all deployed officers" },
    ],
  });

  await db.accreditationSubmission.createMany({
    data: [
      { accreditationId: "acc-9001", submittedOn: daysAgo(10), submittedByUserId: bilal, outcome: "Surveillance audit booked" },
      { accreditationId: "acc-acs", submittedOn: daysAgo(400), submittedByUserId: farhan, outcome: "Renewed", newExpiresOn: daysAhead(75) },
    ],
  });

  // --- Cover for an absence ------------------------------------------------
  //
  // The Finance Officer is away, so their role is lent. This one row is what
  // makes the separation testable: the deputy can sign the Finance rung of a
  // large payment, and still cannot sign the higher-management rung after it,
  // because the rule is on the approver and not on the role.
  await db.roleDelegation.create({
    data: {
      role: "finance_officer",
      fromUserId: imran,
      toUserId: farhan,
      startsAt: daysAgo(2),
      endsAt: daysAhead(12),
      reason: "Annual leave. Cover for spend approvals only.",
      grantedByUserId: imran,
    },
  });

  // --- Items on both tracks ------------------------------------------------
  //
  // One per rung of the ladder, so the chain rules are visible on screen
  // rather than only in a test.

  type Spec = {
    reference: string;
    track: "task" | "request";
    category: "payments" | "premises" | "people_admin" | "decisions" | "uniform" | "accreditations";
    kind: "payment" | "purchase" | "voucher" | "penalty" | "suspension" | "holiday" | "authority_response" | "write_off" | null;
    title: string;
    detail?: string;
    priority: "P1" | "P2" | "P3" | "P4";
    amountPence?: number;
    aboutPersonId?: string | null;
    raisedAgo: number;
    requestedBy: string;
    assignedTo?: string;
    state?: "raised" | "assigned" | "in_progress" | "reviewed" | "approved" | "completed";
    signed?: { step: number; by: string; role: Role; grounds?: string }[];
    link?: Record<string, string>;
  };

  const specs: Spec[] = [
    {
      reference: "ADM-0001",
      track: "request",
      category: "premises",
      kind: "purchase",
      title: "Replace the kitchen water boiler",
      detail: "Element has failed. A like-for-like replacement is £189 fitted.",
      priority: "P3",
      amountPence: 18_900,
      raisedAgo: 3,
      requestedBy: sana,
      assignedTo: sana,
      state: "reviewed",
      link: { assetId: "as-kettle" },
      // Under the low threshold, so one rung: the Admin Manager, alone.
    },
    {
      reference: "ADM-0002",
      track: "request",
      category: "payments",
      kind: "payment",
      title: "Variance on Electricity and gas",
      detail: "Paid £512.00 against an agreed £385.00.",
      priority: "P2",
      amountPence: 12_700,
      raisedAgo: 19,
      requestedBy: sana,
      state: "approved",
      link: { recurringPaymentId: "rp-power" },
      // Over the low threshold: the Finance Officer. One rung, one signature.
      signed: [{ step: 1, by: imran, role: "finance_officer", grounds: "Standing charge increase confirmed against the meter reading." }],
    },
    {
      reference: "ADM-0003",
      track: "request",
      category: "uniform",
      kind: "purchase",
      title: "Uniform order — trousers and shirts",
      detail: "Three sizes at or below their reorder level.",
      priority: "P3",
      amountPence: 248_000,
      raisedAgo: 2,
      requestedBy: sana,
      assignedTo: bilal,
      state: "reviewed",
      link: { stockItemId: "st-tr-36" },
      // Over the HIGH threshold, so two rungs and two distinct people. The
      // first is signed; the second is still outstanding, which is what the
      // approvals queue is for.
      signed: [{ step: 1, by: imran, role: "finance_officer", grounds: "Within the annual uniform budget; three sizes are at reorder." }],
    },
    {
      reference: "ADM-0004",
      track: "request",
      category: "decisions",
      kind: "penalty",
      title: "Recharge for a parking penalty in a company vehicle",
      priority: "P3",
      amountPence: 12_000,
      aboutPersonId: officerPerson,
      raisedAgo: 3,
      requestedBy: bilal,
      state: "reviewed",
      // A decision about a person AND money, so it gathers both chains: the
      // money rung, then HR, then higher management.
    },
    {
      reference: "ADM-0005",
      track: "task",
      category: "accreditations",
      kind: null,
      title: "Gather the outstanding SafeContractor evidence",
      detail: "Site risk assessments are the only manual requirement still open, and it expires in three weeks.",
      priority: "P1",
      raisedAgo: 1,
      requestedBy: bilal,
      assignedTo: sana,
      state: "in_progress",
      link: { accreditationId: "acc-safecontractor" },
    },
    {
      reference: "ADM-0006",
      track: "task",
      category: "premises",
      kind: null,
      title: "Book the boiler's annual gas safety service",
      detail: "Overdue. Kestrel Facilities hold the contract.",
      priority: "P2",
      raisedAgo: 4,
      requestedBy: sana,
      assignedTo: sana,
      state: "assigned",
      link: { assetId: "as-boiler" },
    },
    {
      reference: "ADM-0007",
      track: "task",
      category: "payments",
      kind: null,
      title: "Give notice on Lines and broadband, or renegotiate",
      detail: "The notice window closes in five days; after that it rolls on for another year.",
      priority: "P2",
      raisedAgo: 6,
      requestedBy: bilal,
      state: "raised",
      link: { supplierId: "sup-telecoms" },
    },
    {
      reference: "ADM-0008",
      track: "task",
      category: "uniform",
      kind: null,
      title: "Chase outstanding kit from September leavers",
      priority: "P3",
      raisedAgo: 11,
      requestedBy: bilal,
      assignedTo: sana,
      state: "completed",
    },
    {
      reference: "ADM-0009",
      track: "request",
      category: "people_admin",
      kind: "authority_response",
      title: "Response to the DWP earnings enquiry",
      detail: "Six months of earnings and hours. Goes out under the HR Manager's signature.",
      priority: "P2",
      raisedAgo: 8,
      requestedBy: sana,
      assignedTo: sana,
      state: "reviewed",
    },
  ];

  for (const spec of specs) {
    const raisedAt = daysAgo(spec.raisedAgo);
    const target = PRIORITIES[spec.priority].targetHours;
    const chain =
      spec.track === "request"
        ? approvalChain(
            {
              kind: spec.kind!,
              amountPence: spec.amountPence ?? null,
              aboutPersonId: spec.aboutPersonId ?? null,
            },
            DEFAULT_THRESHOLDS,
          )
        : [];

    const item = await db.adminItem.create({
      data: {
        reference: spec.reference,
        track: spec.track,
        category: spec.category,
        kind: spec.kind,
        title: spec.title,
        detail: spec.detail,
        priority: spec.priority,
        state: spec.state ?? "raised",
        amountPence: spec.amountPence ?? null,
        aboutPersonId: spec.aboutPersonId ?? null,
        requestedByUserId: spec.requestedBy,
        assignedToUserId: spec.assignedTo ?? null,
        raisedAt,
        dueAt: new Date(raisedAt.getTime() + target * 3_600_000),
        startedAt: spec.state === "in_progress" ? daysAgo(spec.raisedAgo - 1) : null,
        reviewedAt: ["reviewed", "approved", "completed"].includes(spec.state ?? "")
          ? raisedAt
          : null,
        completedAt: spec.state === "completed" ? daysAgo(1) : null,
        ...(spec.link ?? {}),
        approvals: {
          create: chain.map((s) => ({
            step: s.step,
            requiredRoles: s.anyOf as Role[],
            reason: s.reason,
          })),
        },
      },
    });

    for (const sig of spec.signed ?? []) {
      await db.adminApproval.update({
        where: { itemId_step: { itemId: item.id, step: sig.step } },
        data: {
          decision: "approved",
          decidedByUserId: sig.by,
          decidedByRole: sig.role,
          decidedAt: raisedAt,
          grounds: sig.grounds ?? null,
          amountApprovedPence: spec.amountPence ?? null,
        },
      });
    }

    // Every item is in the one queue, not an Admin list of its own.
    await db.workItem.create({
      data: {
        title: `${spec.reference} — ${spec.title}`,
        adminItemId: item.id,
        state: spec.state === "completed" ? "done" : "open",
        ownerUserId: spec.assignedTo ?? null,
        ownerRole: spec.assignedTo ? null : "admin_manager",
        dueAt: new Date(raisedAt.getTime() + target * 3_600_000),
        slaDays: Math.max(1, Math.round(target / 24)),
        doneAt: spec.state === "completed" ? daysAgo(1) : null,
      },
    });

    await db.event.create({
      data: {
        type: spec.track === "request" ? "admin_request.raised" : "admin_task.raised",
        actorUserId: spec.requestedBy,
        actorRole: "admin_officer",
        department: "administration",
        adminItemId: item.id,
        personId: spec.aboutPersonId ?? null,
        at: raisedAt,
        detail: `${spec.reference}: ${spec.title}.`,
      },
    });
  }
}
