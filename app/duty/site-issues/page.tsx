import { SiteIssueBoard } from "@/components/duty/SiteIssueBoard";
import { PageHeader } from "@/components/ui/PageHeader";
import { canDo } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/server";
import { staffSiteIssues } from "@/lib/db/site-issues";

export const dynamic = "force-dynamic";

/**
 * Site issues (26 September 2026): what officers find wrong at clients' sites
 * — a broken lock, a leak, a gap in the fence. Control reviews each before the
 * client sees it; the client says when it is fixed; the next officer on site
 * checks.
 */
export default async function SiteIssuesPage() {
  const session = await requireSession();
  const issues = await staffSiteIssues();
  return (
    <div className="space-y-5">
      <PageHeader title="Site issues" description="What officers find wrong at clients' sites. Review each one: share it with the client in your own words and with the photos you choose, or keep it internal." />
      <SiteIssueBoard issues={issues} canReview={canDo(session.activeRole, "site_issue.review")} />
    </div>
  );
}
