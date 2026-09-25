/**
 * The test inbox (Control, 25 September 2026): realistic emails, one or more
 * of every category and priority, for trying the hub safely before a real
 * mailbox is connected. Names match the demonstration clients, sites and
 * officers, so the matching can be seen working. Nothing here is real.
 */

export interface SampleEmail {
  key: string;
  mailbox: "control" | "hr" | "accounts";
  fromName: string;
  fromAddress: string;
  subject: string;
  body: string;
  /** Minutes before now it arrived, for the demonstration. */
  minutesAgo: number;
}

export const SAMPLE_EMAILS: SampleEmail[] = [
  {
    key: "fire",
    mailbox: "control",
    fromName: "Dan Whitfield",
    fromAddress: "d.whitfield@meridian-logistics.example",
    subject: "URGENT - fire at Depot 7 loading bay",
    body: "Control,\n\nThere is a fire in the loading bay at Meridian Depot 7. Fire service called at 11:40 and are on their way. Your officer Wesley is helping evacuate the warehouse. Please call me on 07700 900555 immediately.\n\nDan Whitfield\nSite Manager, Meridian Logistics",
    minutesAgo: 1,
  },
  {
    key: "late",
    mailbox: "control",
    fromName: "Wesley Anand",
    fromAddress: "wesley.anand@example.com",
    subject: "Running late — Riverside Block A",
    body: "Hi, I'm running about 25 minutes late for my 12:00 shift at Riverside Block A concierge. Train cancelled at Stockport. Sorry, I'll be there as soon as I can.\n\nWesley",
    minutesAgo: 4,
  },
  {
    key: "cover",
    mailbox: "control",
    fromName: "Priya Nair",
    fromAddress: "priya.nair@northgate-retail.example",
    subject: "Request for additional Friday night cover",
    body: "Good morning,\n\nCould you please arrange an additional officer at Northgate Retail Park, main concourse, this Friday from 20:00 to 06:00? We have a late-night event and expect higher footfall.\n\nPlease confirm by Thursday 12:00.\n\nKind regards,\nPriya Nair\nCentre Manager",
    minutesAgo: 10,
  },
  {
    key: "complaint",
    mailbox: "control",
    fromName: "Helen Morris",
    fromAddress: "h.morris@riverside-estates.example",
    subject: "Complaint regarding reception conduct",
    body: "I am writing to complain about the conduct of the officer on the concierge desk at Riverside Block A yesterday evening. A resident was spoken to rudely when asking for a parcel. This is not acceptable and I would like to know what you will do about it.\n\nHelen Morris\nEstates Manager",
    minutesAgo: 18,
  },
  {
    key: "noshow",
    mailbox: "control",
    fromName: "Sam Okafor",
    fromAddress: "s.okafor@halton-dc.example",
    subject: "No officer at DC1 perimeter this morning",
    body: "Your officer has not turned up at Halton Data Centre DC1 perimeter for the 07:00 shift. The gate is being covered by our facilities team. We need someone here urgently.\n\nSam Okafor",
    minutesAgo: 26,
  },
  {
    key: "cancel",
    mailbox: "control",
    fromName: "Dan Whitfield",
    fromAddress: "d.whitfield@meridian-logistics.example",
    subject: "Cancel Sunday shift at Depot 4",
    body: "Hi Control,\n\nPlease cancel the Sunday day shift at Meridian Depot 4 — the site will be closed for a stock take. Sorry for the short notice.\n\nThanks,\nDan",
    minutesAgo: 35,
  },
  {
    key: "incident",
    mailbox: "control",
    fromName: "Grace Mbeki",
    fromAddress: "grace.mbeki@example.com",
    subject: "Incident report - attempted theft at Northgate",
    body: "At 02:15 I saw two males trying the doors of the unit 6 shop at Northgate. I challenged them from a distance and they left. No damage and nobody hurt. CCTV footage saved. Report attached to the occurrence book.\n\nGrace",
    minutesAgo: 55,
  },
  {
    key: "request",
    mailbox: "control",
    fromName: "Olga Petrenko",
    fromAddress: "o.petrenko@clearwater-pharma.example",
    subject: "Key holding for the weekend",
    body: "Hello,\n\nCan you please arrange for your officer at Clearwater manufacturing gate to hold the lab keys over the weekend? Our contractor will collect them on Saturday at 09:00.\n\nBest wishes,\nOlga",
    minutesAgo: 70,
  },
  {
    key: "query",
    mailbox: "control",
    fromName: "Liam Corrigan",
    fromAddress: "liam.corrigan@example.com",
    subject: "Question about my rota next week",
    body: "Hi, can I swap shifts on Wednesday next week with Marta? She has agreed. Just want to check it's ok.\n\nLiam",
    minutesAgo: 90,
  },
  {
    key: "newsletter",
    mailbox: "control",
    fromName: "SecureTech Supplies",
    fromAddress: "news@securetech.example",
    subject: "September newsletter — new body cameras",
    body: "Our September newsletter: see the latest body-worn cameras and our autumn promotion. Unsubscribe at any time.",
    minutesAgo: 120,
  },
  {
    key: "sia",
    mailbox: "hr",
    fromName: "Marta Kowalczyk",
    fromAddress: "marta.kowalczyk@example.com",
    subject: "My SIA licence renewal",
    body: "Hello HR,\n\nMy SIA licence expires on 18 October. I have applied for the renewal and attach the SIA confirmation. Please let me know if you need anything else.\n\nMarta",
    minutesAgo: 40,
  },
  {
    key: "rtw",
    mailbox: "hr",
    fromName: "Home Office Employer Checking Service",
    fromAddress: "ecs@homeoffice.example",
    subject: "Right to work check result — action needed",
    body: "The right to work share code you checked has expired. The employee may not be able to continue working. Please carry out a new check before 30 September.",
    minutesAgo: 65,
  },
  {
    key: "holiday",
    mailbox: "hr",
    fromName: "Adebayo Fashola",
    fromAddress: "adebayo.o.fashola@example.com",
    subject: "Annual leave question",
    body: "Hi, how many days of annual leave do I have left this year? I'd like to book a week in December.\n\nThanks, Adebayo",
    minutesAgo: 95,
  },
  {
    key: "grievance",
    mailbox: "hr",
    fromName: "Anonymous",
    fromAddress: "staff.concern@example.com",
    subject: "Concern about a supervisor",
    body: "I want to raise a grievance about the way a supervisor speaks to officers on the night shift. I would like to discuss this confidentially.",
    minutesAgo: 150,
  },
  {
    key: "payroll",
    mailbox: "hr",
    fromName: "Wesley Anand",
    fromAddress: "wesley.anand@example.com",
    subject: "Not been paid for overtime",
    body: "Hi, I have not been paid for the 12 hours overtime I did on 12 September. Can someone look at this please? It has left me short this month.\n\nWesley",
    minutesAgo: 200,
  },
  {
    key: "audit",
    mailbox: "hr",
    fromName: "NSI Audit Team",
    fromAddress: "audits@nsi.example",
    subject: "BS 7858 audit — documents required by Friday",
    body: "Ahead of next week's audit, please send the screening files for the three most recent starters and your training records by Friday 17:00.",
    minutesAgo: 240,
  },
  {
    key: "invoice",
    mailbox: "accounts",
    fromName: "Clearwater Pharma Accounts Payable",
    fromAddress: "ap@clearwater-pharma.example",
    subject: "Query on invoice INV-2291",
    body: "Hello,\n\nInvoice INV-2291 shows 180 hours for August but our records show 168. Please could you check and send a corrected invoice or the timesheets.\n\nAccounts Payable",
    minutesAgo: 45,
  },
  {
    key: "renewal",
    mailbox: "accounts",
    fromName: "Sam Okafor",
    fromAddress: "s.okafor@halton-dc.example",
    subject: "Contract renewal for 2027",
    body: "Our guarding contract at Halton Data Centre ends in December. We would like to discuss renewal for 2027 — please send your proposal.",
    minutesAgo: 300,
  },
  {
    key: "remittance",
    mailbox: "accounts",
    fromName: "Meridian Logistics Finance",
    fromAddress: "finance@meridian-logistics.example",
    subject: "Remittance advice",
    body: "Please find our remittance advice for payment of invoices INV-2270 and INV-2275. For information only.",
    minutesAgo: 360,
  },
  {
    key: "safeguarding",
    mailbox: "control",
    fromName: "Riverside Block A concierge",
    fromAddress: "concierge.blocka@riverside-estates.example",
    subject: "Child found alone in the car park",
    body: "Officer on Riverside Block A: a young child, about 6, is alone in the car park and says they cannot find their mum. I am staying with the child. Safeguarding — please advise and call the police if needed.",
    minutesAgo: 0,
  },
];

/** The test mailboxes: one per department. */
export const TEST_MAILBOXES = [
  { key: "control", address: "control@test.leonguarding.example", displayName: "Control Room (test)", department: "control" as const, officeHoursOnly: false },
  { key: "hr", address: "hr@test.leonguarding.example", displayName: "HR (test)", department: "recruitment" as const, officeHoursOnly: true },
  { key: "accounts", address: "accounts@test.leonguarding.example", displayName: "Accounts (test)", department: "administration" as const, officeHoursOnly: true },
];
