# 04 — Decisions needed

The HR decisions are logged in [`docs/proposal/07`](../proposal/07-open-questions.md) as A–D, and
still stand. The wider scope creates these. They are numbered **E** so the two lists never collide.

Answered ones stay in the log with the answer, because the answer is the reason the code is the way
it is. The ones that block a release are marked; the rest can be answered as the build reaches them.

## Answered

### E1 — INDEL — **answered**
> The portal will fully replace INDEL. No continuing INDEL integration is required.

So full replacement is the end state, and there is nothing to integrate with. That sits comfortably
with the earlier direction to stop weighing migration against integration: **the replacement happens
by the platform covering the ground, release by release, not by a cutover project.** Each release is
usable on its own, and INDEL stops being used for whatever the platform has taken over.

Nothing in the plan depends on INDEL, and no design decision is now waiting on it. The only thing
left is what should be loaded into the platform at the start, which is **E9**.

### E3 — How officers interact with the system — **answered**
> Officers have their own personal phones, and some sites also provide a phone.

So two channels, and the design uses both:

| Channel | What it proves | Used for |
|---------|----------------|----------|
| **Site phone at the post** | That the officer was **at the site** — the call comes from the site's own line | Preferred where a post has one. The strongest routine record we can get without installing anything |
| **Officer's own phone** — app or call | That the officer had their phone | Everywhere else, and always available as a fallback |

Recorded per contact and shown on the live board (`lib/core/ops.ts` — `CHANNEL_EVIDENCE`), so the
strength of each record is visible rather than assumed. Two consequences:

- **No app install can be made mandatory.** It is the officer's own handset, so the phone route has
  to work for someone who will not or cannot install anything. That is a design constraint, not a
  preference.
- **QR or NFC tags at the post** remain the only way to prove physical presence outright. Not
  needed now; worth knowing it is the upgrade path if a client ever asks for proof of patrol.

### E4 — The check-call ladder — **answered**
> After one hour, if the officer has not given the check call, it starts triggering. It gives instant
> triggers, if it crosses a minute. Then we take further measures to get in contact. If we cannot
> reach them, a person from the operational team goes to site to check everything is okay.

Implemented exactly as stated, in `lib/core/ops.ts`:

| Step | What moves it here | Who acts |
|------|--------------------|----------|
| — | Check call received | Nothing. The clock restarts |
| 1 | **The hour is crossed** — triggers immediately, no grace period | Control tries the officer: own mobile, then the site phone |
| 2 | That attempt failed | Control widens it — site phone, other officers on site, the client's on-site contact |
| 3 | Contact still cannot be made | **A member of the operational team attends site** |

**There are no timers between the steps, and nothing is assumed.** The only threshold in the whole
rule is the hour itself. The step advances when an **attempt fails**, which is what actually
happens: Control does not wait a set number of minutes before trying the site phone, it tries the
site phone because the mobile did not answer.

That has one consequence worth knowing, because it is a change to how Control works rather than just
to the software: **each attempt has to be logged.** The attempt log is what drives the escalation —
it is not paperwork after the fact. It is also the record that shows the duty of care was discharged,
which is the thing an insurer or a coroner would ask for.

One open option, not an assumption we have made: whether a **lone-working post** should escalate
faster than a post with several officers on it. The rule above is currently applied identically to
both.

## Blocking R3

### E2 — What availability does the operation need?
Once Control works the rota and the live board here, an outage is an operational incident rather
than delayed admin. Needed: an uptime position, a backup and recovery position, and what Control
does during an outage. A printed rota and a phone number is a perfectly good answer — it just has to
be the agreed one, and book-on needs a route that works when the system does not.

## Needed soon

### E5 — Telephony and messaging — **answered, and widened**
> **Already on WhatsApp and the SIM carrier. Build messaging in — officer contact and a helpdesk.**

This answers more than was asked. The question was about cost per message; the answer is that the
operation currently runs on WhatsApp and phone, and that an in-built messaging feature is wanted so
officers and a helpdesk are reachable inside the platform.

That is a **new domain**, not a setting — see [01 §2](01-scope-and-domains.md#2-the-thirteen-domains),
domain 14. The reason it is worth building rather than continuing on WhatsApp is not convenience:

- A WhatsApp message is **not a record.** It lives on two handsets, leaves when the officer leaves,
  and cannot be produced for an audit or a tribunal. A welfare conversation is exactly the thing
  somebody will later need to prove happened.
- It is **outside the retention policy.** Clause 11 and the company's own 12-month / 7-year rules
  cannot reach a WhatsApp group, so the platform would be deleting records that still exist
  elsewhere — which is worse than not having the policy.
- A message in the platform can **be** the check-call evidence. `ContactChannel` already has `app`
  and `CHANNEL_EVIDENCE` already rates it above SMS, so this slots into the escalation ladder that
  exists rather than sitting beside it.

What it does **not** replace is the phone for welfare escalation. The ladder ends with a person
attending site, and it must keep ending there: an unanswered message is not a welfare check.

Still needed before building it: see E16.

### E6 — Data protection — **answered**
> **Agreed.**

A data-protection review before R3, owned by the Portal Owner. It now has more to cover than when the
question was written: the two new domains add **message content** (potentially health-adjacent, in a
welfare conversation) and **a third party seeing officer data** through the client portal. The second
is the one to get right — see E17.

What the review has to cover: screening data, health-adjacent welfare records, possibly location,
message content, and disclosure of officer data to a client. A DPIA is very likely required, the
lawful basis for location needs stating, and the retention schedule needs extending across every new
domain. Before R3, not after.

### E7 — Do clients get access? — **answered**
> **Yes. A client portal: their own sites, systems, inspections and everything.**

In scope. Domain 15 in [01 §2](01-scope-and-domains.md#2-the-thirteen-domains), and it is the one
domain that should own **nothing at all** — like Insight. A client portal is a *scoped view* over
Places, Assignment, Live operations and Quality, not a copy of them. The moment it holds its own
records, two systems are describing the same site.

"Everything" is the word to be careful about, and E17 is where that gets settled.

### E8 — Where do hours go?
Which payroll and accounts systems consume the approved hours, and in what format. It shapes the
export, not the platform.

### E9 — What existing data should be loaded at the start?
Now the last INDEL question, and a narrow one: on day one of R1, which officer and candidate records
should already be in the platform, and where does each field come from? The spreadsheets and INDEL
are the sources.

This is a **load**, not a migration — a one-off import into a schema that already exists, not a
programme to keep two systems in step. What it needs is a list of fields and one person who can say
which value is right where two sources disagree. Worth doing before R1 goes live rather than after,
because a record loaded wrong is then chased, reminded about and reported on.

> **Answered: the data comes once the system is ready.** Parked until R1 go-live, which is the right
> point — loading before the screens are finished means loading twice.
>
> One thing to start early, because it is the slow part and does not depend on us: deciding **who
> arbitrates** where the spreadsheets and INDEL disagree about the same officer. That is a person,
> not a file.

### E10 — Signal at the posts — **answered, and built**
> **Yes, there are such sites. The officer books on before entering. For check calls, the helpdesk
> emails the client to say our officer has reached the location and there is no signal; the client
> then stays in contact with the officer, who uses the site phone. If the client cannot reach the
> officer, they tell the helpdesk or Control Room and somebody goes to site to check.**

This is the most consequential answer in the series so far, because it was not a gap in the plan — it
was a **bug in code already shipped**. The live board computes a missed check call the moment the hour
is crossed. On a post with no signal that would have fired every hour, all night, against an officer
who physically cannot call. A board that is always red is a board nobody reads, which is the exact
failure this platform has been designed around everywhere else.

What the answer changes, and it is a change of model rather than a tolerance:

- **Signal is a property of the post**, not of the shift. `Post.mobileSignal`, defaulting to true, so
  the exception is something somebody has to state.
- **The contact obligation moves to the client.** A new state, `client_held`: nobody is waiting for
  the officer to call. What is being watched is whether the client has been told, and whether they
  have come back.
- **The handover is recorded**, in `NoSignalHandover` — who at the client was told, and when. On an
  ordinary post the check calls are the trace that somebody was in contact with a lone officer
  overnight. Here there are none to have, so the handover is the only trace there is, and it is
  recorded whole or not at all.
- **The client's report is the failed contact.** There is no mobile to try, so it goes straight to
  attend site rather than starting at the top of the ladder.
- **Book-on precedes entry**, which is the only moment the officer has a signal to do it with. The
  seeded example books on ten minutes before the shift starts, from outside the site.

Two consequences elsewhere:

- **Offline queueing is not needed for book-ons**, because the book-on happens in signal, before
  going in. That is a real simplification of what E5 looked like it would require.
- **The in-built messaging of E5 cannot reach these posts at all.** Whatever is built there, the
  client-held model is the fallback, not a degraded version of messaging.

One thing built on judgement rather than on the answer, and worth confirming: a no-signal post with
no book-on at the start of the shift is treated as immediately actionable rather than given the usual
15-minute grace. The grace exists because an officer can book on late; on this post they cannot — once
they are inside, they have no signal. So the grace would only delay noticing.

### E11 — Who owns the platform? — **answered**
> **Portal Owner: Muhammad Shahzad. Operational Lead: Tanveer Mahmood.**

Two routes, which is better than one: build decisions, scope and sign-off go to the portal owner;
anything about how Control and the operations team actually work goes to the operational lead. The
Control discovery session ([document 05](05-control-discovery.md)) is the operational lead's to
convene.

Recorded here and **nowhere in the code**. Who holds which *role in the platform* stays data, set up
in Admin, so a transfer is an edit rather than a release — `lib/roles.ts` contains no names by
design. This supersedes D5.

### E12 — What is it called? — **closed**
> **It was only ever about clarifying the HR section.**

No rename. "HR" stays as the name of the section, and the repository name stays as it is. Closing
this rather than leaving it open, because an open naming question invites a rename halfway through a
release.

### E13 — What exactly are "Department of Work matters"? — **answered**
Read as **DWP correspondence** — earnings enquiries, benefit verification, and correspondence tied to
suspensions — and built that way in [06](06-admin-department.md).

Deliberately built so a wrong reading is cheap: the **body** is a fixed list (DWP, HMRC, Home Office,
tribunal, local authority, SIA, other) and the **kind of matter is free text**, so an enquiry we have
not seen before is a row rather than a migration. If it turns out to mean something else entirely, it
costs a label and not the workflow.

> **Answered: yes, the DWP reading is right. Details to be confirmed later.**

Built as described. The free-text matter type means a kind of enquiry we have not met yet is a row
rather than a migration, so "details later" costs nothing.

### E14 — Are £250 and £2,000 the right approval thresholds? — **answered**
The agreed starting figures, held as settings (`admin.approval.low_threshold_pence`,
`admin.approval.high_threshold_pence`) rather than constants, so changing them is an edit with an
event against it and no release. Only higher management may change them, and requests already raised
keep the chain they were raised with.

> **Answered: yes, and they can be changed later if they need to rise.**

Which is why they are settings. Changing one is an edit with an event against it and no release, and
requests already raised keep the chain they were raised with — so raising a threshold next year does
not rewrite the approvals that happened under the old one.

One thing to watch rather than act on: whoever can change a threshold should not be the same person
approving just above it. Today `threshold.change` is higher management only, and so is the top rung —
which means the Portal Owner could in principle raise the threshold and then approve under it. The
event log names both, so it is visible rather than silent, but if that ever matters the fix is to
require a second signature on a threshold change.

### E15 — Cover when the Finance Officer is away — **answered and built**
Designed, not built: a **time-boxed delegation to a named person**, recorded with its start and end
date. The alternative — a silent fallback to "anyone in higher management" — would widen who can
spend money every time somebody takes leave, which is the opposite of the control.

> **Answered: Mr Shahzad deputises.**

**Built.** A delegation is a named person, for a named period, with an end date that cannot be left
off — `RoleDelegation` in the schema, the rules in
[`lib/auth/delegation.ts`](../../lib/auth/delegation.ts), and the screen on `/system`. Not
open-ended, per the recommendation: 90 days maximum, and renewing leaves a second record.

Recorded here and **nowhere in the code**, like E11. The deputy is a row somebody grants, not a name
compiled into the build, so it can change without a release.

The property worth knowing, and it is tested: a delegation relaxes **no** separation rule. Somebody
holding higher management in their own right and Finance Officer by delegation can sign the Finance
rung of a large payment and then **cannot** sign the higher-management rung after it — the database
indexes the approver, not the role. So lending the role covers the absence without collapsing the
two-signature control, which was the whole worry. Anything approved while a delegation was in force
stays on the record with the delegation named, which is why it is revoked rather than deleted.

### E16 — What is the in-built messaging actually for? *(from E5)*
> **Question 1 answered: it replaces the WhatsApp groups.**

That raises the bar rather than lowering it. If it replaces them, it has to be good enough to be the
only channel — because the fallback, once the groups are wound down, is the telephone. Two things
follow that were not true of a messaging feature sitting alongside WhatsApp:

- **It needs a wind-down, not a launch.** A date, the groups archived, and people told. Two channels
  running in parallel means the platform's copy is the incomplete one.
- **It cannot reach a no-signal post** (E10). On those posts the client-held model is the answer, and
  it is not a degraded version of messaging — it is a different mechanism. Wind the groups down
  knowing that.

Still open, and all four change the build rather than the styling:

1. **Is a message ever the record of a check call?** `ContactChannel.app` exists and is rated above
   SMS, so it can be. If yes, an officer's "all well" message satisfies the hourly call and the
   ladder stops — a real operational change that needs Control's agreement, not just ours.
2. **What is the helpdesk?** A queue with a service level and named owners, or a shared inbox? A
   queue is Work-engine items and already half-built; an inbox is something else. Note the helpdesk
   already has a job in the E10 process — it is the desk that emails the client — so it exists as a
   function whether or not it becomes a queue.
3. **How long are messages kept?** They will carry welfare and health-adjacent detail. Retention has
   to reach them, which means a rule per conversation type, and it is the main reason building this
   beats staying on WhatsApp.
4. **Group or one-to-one?** A per-site group is the WhatsApp habit. It also means every officer on a
   site sees every message about it.

### E17 — What exactly can a client see? *(from E7)*
> **Officer identity agreed: name and SIA number where the contract requires it, nothing more.**

Recorded as the rule. It still belongs in the E6 data-protection review, because agreeing it and
having a lawful basis for it are different things — but the scope is now settled, and it is the
narrowest version that still works commercially.

Note it interacts with E10: on a no-signal post the client is holding contact with a named officer on
the site phone, so they necessarily know who that officer is. The rule above already permits that,
which is the right answer, but it means the no-signal process is a live example of officer identity
reaching a client rather than a hypothetical one.

Still open:

1. ~~**Officer identity**~~ — answered above.
2. **Inspections: results, or only the report?** Do they see a failed inspection and the corrective
   action still open, or only completed reports? The honest answer is more useful commercially and
   harder to swallow the first time it happens.
3. **Can a client raise a requirement directly?** If yes, that bypasses the Control pool check, which
   is where the timestamped handover to HR comes from. Recommendation: they raise a *request*, Control
   turns it into a requirement — same two-track pattern as Admin.
4. **Which client contacts, and who grants them?** A client portal user is an account somebody must
   create, review and revoke when a contact leaves that client. That is a real ongoing task, not a
   one-off setup.
5. **Live, or as-at?** Seeing the live board for their own site means seeing a no-show as it happens.
   Commercially brave. Worth deciding deliberately rather than discovering.

### E18 — How the rota is built — **answered, and built**
> **Next week is not a copy of this week; it changes every time. Posts are not fixed to one officer —
> but sometimes they are. Availability is known by asking the officers.**
> *(Control, 24 September 2026 — discovery questions 4, 5 and 6.)*

Each answer removed something the plan could easily have assumed:

- **No "copy last week".** The week starts from the posts, not from last week's names. Each post's
  pattern (`Mon–Sun 1900–0700`) is read into the days and hours it needs cover, and every one of those
  with nobody on is drawn as a gap. A pattern the reader cannot parse draws no gaps rather than wrong
  ones; that post is filled by hand.
- **A regular officer, optional.** `Post.regularPersonId`. Most posts have none and are covered from
  the pool. Where one is named, they are suggested first — and still asked. After them come officers
  allocated to the post through a client requirement, then whoever has worked it most in the last
  four weeks.
- **No availability calendar.** Officers do not declare availability, so the platform does not ask
  them to. What it records instead is the ring-round: `ShiftAsk`, one row per shift offered, with who
  asked, how (phone, WhatsApp, text, in person), when, and the answer — yes, no or no answer. A yes
  puts the shift on the rota as a draft **in the same transaction**, and the database refuses a yes
  that does not name its draft, or a draft that is not the shift asked about (constraints §17). This is
  the same principle as the check-call ladder in E4: the attempts are the record, not paperwork after
  it.

Built alongside, because building the week exposed them:

- **Deployability is judged at the end of the shift**, not when the rota is looked at. Before this, a
  licence expiring on Wednesday passed the check for Thursday night if the draft was published on
  Monday. Publishing a single shift, publishing the week, and the page's preview all use the same rule.
- **Every date and time is shown in UK time**, whatever the clock on the machine showing it. The
  development machine is on Pakistan time, and until now shift times were displayed in it.

Still waiting on the rest of the discovery session, and deliberately not assumed: who may change a
**published** rota and who is told (question 7), cover on the night (9–12), and any limit on hours or
list of officers kept off a site (13–14). Hours and rest are shown to Control, not enforced.

### E19 — Changing the rota on the night, and weekly hours — **answered, and built**
> **Control changes the rota and assigns shifts accordingly — a sick call, or a change of mind, is
> changed at once: find the alternative for that job and assign it. Hours are limited to each
> officer's working hours.** *(24 September 2026 — discovery questions 7, 9, 10 and 13.)*

What that became:

- **Control changes a published rota, instantly** (question 7). There is no approval step between a
  sick call and the change; the change keeps the shift as it was, who changed it and why, as an
  amendment.
- **An officer comes off** — sick, changed their mind, or did not turn up. Before the shift, the whole
  shift comes off; part-way through, it ends now. Either way what is left becomes a **cover need**
  (`CoverNeed`), which stays at the top of Scheduling, in red, until it is settled.
- **Finding the alternative** (questions 9–10) is the same ring-round as building the week, narrowed to
  the hours still to cover: everyone who can work them without a clash, inside their weekly hours and
  cleared to deploy, the officer who came off left out. Each call is recorded against the cover need.
  A yes goes on the rota **published, at once** — there is no weekly publish to wait for. Cover found
  late starts when it is offered, so the time nobody was there stays visible.
- **Nobody can be found** is a decision, not a silence: the cover need is closed with the reason, which
  is where "client told at 17:40" belongs.
- **The same holds for a post that is empty right now** with nobody ever on it: a yes starts from now
  and is published at once.
- **Weekly hours** (question 13). `Employment.weeklyHours`, the officer's agreed working hours, is the
  most the rota may give them in a Monday-to-Sunday week (UK time; a Sunday night counts in both weeks
  it falls in). The rota refuses anything over it — asking, covering, changing hours and publishing all
  check it. It defaults to 48, the Working Time Regulations week, until somebody sets the agreed
  figure. **Control sets it** (confirmed the same day, reversing a first draft that kept it with the
  managers), on the Officers page or straight from the ring-round when an officer is refused for
  hours. Every change is an event naming who made it and what it was before.

Still not assumed: how officers are **told** about a change (the page says who to tell; sending it
waits on E16), whether any officer is kept off a particular site (question 14), and whether rest
between shifts should be enforced rather than shown. An officer deployed from a candidacy without an
employment record has no hours of their own yet, so the 48-hour default applies to them.

### E20 — Planning in bulk — **answered, built, and then reshaped by E21**
> **Control must be able to add the rota for a week or a month in one go, then assign officers — many
> edits at once. One at a time does not work for 300–400 officers.** *(24 September 2026.)*

This does not undo E18 — each week is still built fresh, and availability is still known by asking —
it changes the unit of work from one call to one plan:

- ~~**The rota's shape is set once, per post.**~~ Replaced the same day by E21: the gaps are no longer
  drawn from a post's pattern, they are open shifts Control creates.
- **One or four weeks on screen.** The four-week view shows the month, with the post pinned while the
  days scroll.
- **Planning mode** turns every gap into an entry box. Control types a PIN or a name straight in, like a
  spreadsheet, and each entry is checked as it is typed — deployable for that shift, no clash (with the
  rota or with the rest of the plan), inside the officer's weekly hours — before anything is sent.
  "Fill regular officers" types each post's regular officer into its empty gaps in one go.
- **Tick and act.** Tick a row (one post, every day shown), a day (every post), or every gap, and give
  them all to one officer; tick drafts to publish or take them off together.
- **One save.** The server checks the whole batch again, in time order and against itself, saves what
  passes in one transaction, and hands back each refusal with its reason, which stays in its box in
  red. Each saved shift is recorded as an ask answered yes, by the channel chosen for the batch — so
  the availability record is still there, in bulk.
- **Publishing four weeks** is one click, through the same deployability and hours checks as one
  shift, in a handful of statements rather than one per shift.

Measured on the development data: four weeks of weekday shifts given to one officer (20 entries, 16
saved and 4 refused for hours) saved in about three seconds, and 34 drafts over four weeks published
in one click. Not yet measured at 300–400 officers' worth of real data; that is worth doing once the
real posts and officers are loaded (E9).

Not built: one-off extra shifts outside a post's pattern (an event night) in bulk — today they are
added one post at a time from the post's panel.

### E21 — The rota is created first, then filled — **answered, and built**
> **Create shifts in bulk first, before assigning them to officers: an interactive calendar to mark
> the dates from and to, and the shift times; generate the unassigned shifts across those dates; then
> assign officers to the open shifts, in bulk, by their availability.** *(24 September 2026.)*

This replaced the first version of bulk planning (E20), which drew each post's gaps from its pattern.
Control wanted the rota as a thing they make, not a thing the system infers. So:

- **Open shifts are real.** `OpenShift`: a post, a start and an end, who created it, and — once filled
  — the assignment on it. The database refuses two overlapping shifts on one post (constraints §19),
  so creating the same fortnight twice makes nothing new; the second attempt says so.
- **Create shifts** is a calendar: choose the posts (by site, or search), click the first day and the
  last, choose the days of the week, and one or more shift times (day, night, day-and-night, 9 to 5,
  or any). The count is shown before anything is made — "28 shifts: 2 posts × 14 days". Up to three
  months and 5,000 shifts at a time. Clicking an empty day on the roster opens it with that post and
  day already chosen.
- **Assigning by availability.** "Available" is everything the platform knows: cleared to deploy
  for that shift, **not on approved leave**, no clash, inside their weekly hours. A leave request
  still waiting is shown as a warning, not a block. Three ways to use it, all in bulk:
  - tick shifts and pick from **who is free for them** — "free for all 10", "free for 6 of 10";
  - **Suggest officers**: every ticked (or every) open shift is given a free officer — the regular
    officer first, then anyone allocated to the post, then whoever knows it, then whoever has the
    fewest hours — typed in for Control to look over and change before anything is saved;
  - type PINs straight in, as before.
- **The one-at-a-time route is unchanged**, on open shifts: open one, ask, record the answer.
- Taking a draft off leaves its shift open again; a shift cancelled as not needed takes its open
  shift with it; changing the hours moves both together.

Asking is still the record (E18): every assignment made in bulk is recorded as an ask answered yes,
by the channel chosen for the batch. What is still not known to the platform is the availability an
officer tells Control on the phone — days they cannot do, next week only — beyond leave. If that
needs to be recorded ahead of the rota rather than at the moment of asking, it is a new decision.

### E22 — Duty checks: chase-up, book-on, check calls — **answered, and built**
> **Duty confirmed → chase-up two hours before → officer confirms → book-on at site → hourly check calls
> → alert if one is missed. Book-ons and check calls were the same page and did not relate; give each
> its own. Day patrol and Concierge desk need check calls on night duty and at weekends.**
> *(24 September 2026.)*

- **Three pages, one flow.** Chase-ups, Book-ons and Check calls each have a page laid out for that step's
  work, with the same five-step flow across the top of each, the live board and the dashboard, so the
  whole picture is one glance and the next job one click.
- **The chase-up** is new: it opens two hours before the shift, turns red with under an hour to go and no
  confirmation, and records every try (`ChaseUp`, constraints §20). "Cannot attend" takes the officer
  off and puts the shift on the cover list, the same as the rota's "Officer can't do it".
- **Book-on**: late after 15 minutes, a no-show after 30 (unchanged, E4); no book-on more than an hour
  before the start, after the end, or for an officer who came off.
- **Check calls** are laid out per shift as a timeline — made, made late, missed, still to come — hourly
  from the last contact to the end of the duty; the escalation ladder is E4's, unchanged.
- **Check calls per shift, not per post.** `Post.checkCalls` is *every shift*, *night duty and weekends*,
  or *never*. Night duty is any hours between 22:00 and 06:00; weekend is any hours on a Saturday or
  Sunday. Day patrol and Concierge desk are *night duty and weekends*; the rest *every shift*.
- **Alerts are durable** as well as live: `npm run sweep:duty` (to be scheduled every minute; it also
  runs after every duty page, the dashboard and each check) raises a task and an event for an
  unconfirmed chase-up, a missing book-on and a missed check call, and closes them when put right.
- **Demonstration data**: `npm run demo:duty` builds ten shifts around the current time, one in every
  state, for reviewing the pages. Not for production.

### E23 — Officers do their own checks; Control monitors — **answered, and built**
> **Officers perform their own duty checks from their own portal — view their duties, book on when
> they arrive, make their check calls — and see only their own duties and information. The employer
> side is a monitoring system. If an officer misses a book-on or a check call, both the officer and
> the employer are alerted.** *(24 September 2026.)*

- **An officer role**, holding one permission (`duty.self`) and one page (`/me`). Every other path is
  closed to it by the navigation fence; every officer action loads the shift and refuses it unless it
  belongs to the person signed in, with the same answer whether the shift is someone else's or does not
  exist. Their duties are read by the person on the session, never by anything the page sends.
- **The portal, built for a phone**: the shift on now or next, with the one thing to do — confirm, book
  on, make the check call ("all well", or what is wrong) — upcoming and completed duties, and their alerts.
  An officer can also say they cannot make a shift; Control is alerted and takes them off.
- **Accounts attach to the officer's existing record**, proved by PIN and date of birth
  (`/signup/officer`). *Before going live this needs a one-time code to the mobile on file (E16) and a
  limit on attempts.*
- **Alerts on both ends**: the sweep addresses each missed book-on or check call to the officer's
  account (shown in their portal) and to Control (its task list and the dashboard), and closes both when
  the officer puts it right — immediately, since every check re-runs it. Push or text to the phone waits
  on messaging (E16).
- **Control monitors**: each book-on and check call shows whether the officer made it themselves or
  Control recorded it for them. Control's own buttons fold behind "Record for them — they rang in
  instead" for officers with a portal, and stay open for those without, because an app cannot be made
  mandatory (E3). The dashboard shows how much the officers did themselves.

### E24 — The Control Room runs live, and alerts reach people — **answered, and built**
> **Control's screens must stay current whether anyone reloads them or not, and the checks must run
> whether anyone is signed in or not. Officers and Control must get alerts that grab their
> attention.** *(25 September 2026.)*

- **The server runs the duty sweep itself**, every 30 seconds from start-up (`instrumentation.ts`).
  Where the portal is hosted on a platform that does not keep a server running, set `DUTY_WORKER=off`
  and have its scheduler run `npm run sweep:duty` every minute instead.
- **Screens update themselves**: every open page asks a pulse (`/api/pulse`) every few seconds and
  refetches its data the moment anything has been written — every write goes to the event log, so the
  log is the signal. What is being typed is never pulled away; the refresh waits until typing stops.
  *Nothing may write to the event log while a page renders*, or every open screen would refresh in a loop.
- **The alarm**: a red bar on every Control page with the count, the next uncovered shift and a siren
  that repeats every 20 seconds until acknowledged (per screen); the tab flashes. Officers get the same
  for their own alerts, with vibration.
- **Web push** to phones and desks, through the browser (no text-message provider needed): officers
  reminded every 5 minutes, 3 times at most; Control desks once per alert. Every delivery is recorded
  against its alert. iPhones need the portal added to the home screen. *Needs `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` — a fresh pair and a real company address for production.*
  Text messages or phone calls remain E16: the same place, another channel.

### E25 — Uncovered shifts, and tasks that can be worked — **answered, and built**
> **Make uncovered shifts easy to see. Tasks need Open, "I'll take it" and Done, and the two Control
> desks need to see who is handling what.** *(25 September 2026.)*

- A shift nobody is on that starts within 24 hours raises an alert and a task; uncovered shifts lead the
  dashboard and the Live board, and the alarm bar names the next one with a countdown.
- Tasks open where their work is done, can be taken (and taken over, which is logged), handed back, and
  closed with a note. Alerts close themselves when put right; a missed check call closed by hand must
  say how the officer was reached.
- The dashboard shows only real data. The hard-coded sample sections are gone.

### E26 — Clients, sites and posts entered by Control — **answered, and built**
> **Clients, sites and posts must be added in the portal.** *(25 September 2026.)*

Control holds `place.manage`. A site carries its location and on-site radius, its on-site contact and
address; a post its check-call rule, signal, phone and the instructions its officers read. Nothing is
deleted — made inactive, and not while shifts are still ahead. Sales and management can read it.

### E27 — Selfie proof on book-ons and check calls — **answered, and built**
> **Officers book on and make check calls with a selfie through the portal's camera, with the details,
> the location and a QR code on the picture itself.** *(25 September 2026.)*

- The live camera, not the gallery; the phone's location read at the same time. The portal stamps the
  photo with who, the post, the UK date and time, the coordinates and accuracy, a reference and a QR code
  that opens the server's own record (`/duty/verify/<code>`), so an edited stamp is caught.
- The server judges the distance from the site against its radius. Away from the site raises an alert to
  Control; no location, a vague fix or a gallery photo is shown as weaker evidence.
- A broken camera does not stop a real officer booking on: "Camera not working?" still books on, and
  tells Control to ring them. Reporting a problem never waits for a photo.
- *To decide before go-live*: how long selfies are kept (a proposal: 90 days, longer when attached to an
  incident), and the privacy notice officers are given. Location and photos are personal data (E6).

### E28 — The rest of "make it easier for everyone" — **answered, and built**
> **Agreed, 25 September 2026.**

- **Officers**: tap to call Control (the number is the `control.phone` setting — a placeholder until the
  real one is set), a map of the site, the post's phone and instructions, "I'm running late", report an
  incident, offer for open shifts, and say which days they are free.
- **Control**: offers accepted or declined on the rota (accepted exactly as a yes on the phone, and the
  officer told either way); availability shown on the candidates and used for suggestions; eleven hours'
  rest between shifts **enforced**; officers kept off a site, with the reason, enforced everywhere; an
  officer's own page; searchable history lists; hours for payroll as a spreadsheet; an Operations Manager
  login (`olivia`).

### E29 — Escalation step 3, the welfare visit — **answered, and built**
> **A supervisor or the Operations Manager attends. If nobody is marked arrived by the expected time,
> the alarm goes to the Control Room and the Operations Manager — two minutes' grace. The police are
> called when an incident occurs and needs them. The outcomes as proposed.** *(25 September 2026.)*

- At step 3 (two failed tries, or the client on a no-signal post saying they cannot reach the officer),
  the check-calls page offers **Send someone to site**: a supervisor (name and phone) or an Operations
  Manager (from their account), and how long until they are there. The Operations Manager is pushed at
  once, whoever goes.
- **The arrival clock**: not marked arrived two minutes after the time given raises an alarm on every
  Control and Operations Manager screen, pushed to their devices; it closes itself on arrival.
- **What was found**: safe and well; unwell, ambulance called; not on site, post left; not found, police
  told; or called off because the officer got in touch first. Every outcome says what happened. Unwell,
  post left and not found take the officer off and put the rest of the shift on the cover list. "An
  incident — police called" can be ticked on any outcome, needs the police reference, and raises a
  serious incident carried by the visit. The missed-call alert closes with it.
- The record stays on the shift: one visit at a time per shift, nothing closed without an outcome, and
  "not found" impossible without the police — enforced in the database (constraints §22).

## Still open from the HR scope

Three items remain in [`docs/proposal/07`](../proposal/07-open-questions.md), and **none of them
blocks the build**:

- **C16** — which clients or posts involve contact with children or vulnerable adults, and what
  level of disclosure is obtained (clause 7.7j, Note 6). Real compliance work, currently
  unspecified. The schema carries the `regulatedActivity` flag ready for it
- **C18** — whether the contract wording making confirmation conditional on screening is signed off.
  A document to sign; no amount of software substitutes for it (clause 7.5.2)
- **C13 follow-up** — a setup task rather than a question: load each higher-management training
  record with the date it was last *reviewed*, because clause 6.2 asks for an annual review and
  "completed" carries no date

Answered and now implemented:

| # | Answer | Where it lives in the build |
|---|--------|-----------------------------|
| C13 | Higher management hold the required certifications and training | `lib/roles.ts` — `canGrantRole` refuses a screening role without in-date training |
| C14 | 12 months for unsuccessful applicants, 7 years for leavers, every deletion logged | `lib/bs7858.ts` — `RETENTION`; `prisma/schema.prisma` — `DisposalRecord`, append-only |
| C15 | The portal fully replaces INDEL | E1 above |
| C17 | Withdrawn — no INDEL integration required | Removed from the plan |
| C21 | The portal is the single source for SIA, right to work, visa and all compliance information | The register in [document 02 §3](02-shared-engines.md#3-the-single-source-of-truth-register) |
