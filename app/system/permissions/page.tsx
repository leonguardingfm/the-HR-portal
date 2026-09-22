import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatTile } from "@/components/ui/StatTile";
import { ACTIONS, canDo, type ActionId } from "@/lib/auth/permissions";
import { requireSession } from "@/lib/auth/server";
import { NAV, NAV_GROUPS } from "@/components/layout/nav";
import { ROLE_OPTIONS } from "@/lib/roles";
import { ROLE_LABELS } from "@/lib/labels";
import type { Role } from "@/lib/types";

/**
 * Every action, and which roles may take it.
 *
 * This is the same table the server enforces — it is read from
 * lib/auth/permissions.ts, not transcribed from it, so the page cannot go out
 * of date with what actually happens when a button is pressed. Which is the
 * only reason a page like this is worth having: a permissions document that is
 * maintained by hand is a description of what somebody once intended.
 *
 * Two shapes are worth reading off it:
 *   - Higher management holds almost nothing operational. A director recording
 *     Control's check calls is precisely the intervention this prevents.
 *   - The auditor holds nothing at all.
 */
export default async function PermissionsPage() {
  const session = await requireSession();
  const roles = ROLE_OPTIONS.map((r) => r.id);
  const actions = Object.keys(ACTIONS) as ActionId[];

  const heldBy = (role: Role) => actions.filter((a) => canDo(role, a)).length;
  const mine = heldBy(session.activeRole);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Permissions"
        description="Who may do what, read from the enforcement matrix itself rather than written out beside it. Navigation decides who may SEE a screen; this decides who may press the buttons on it, and every server action checks it before it touches the database."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Actions in the platform"
          value={actions.length}
          detail="Each one guarded on the server"
        />
        <StatTile
          label="You hold"
          value={`${mine} of ${actions.length}`}
          detail={`Working as ${ROLE_LABELS[session.activeRole]}`}
        />
        <StatTile
          label="Higher management holds"
          value={`${heldBy("top_management")} of ${actions.length}`}
          detail="Deliberately few — seniority is not an operational role"
        />
        <StatTile
          label="The auditor holds"
          value={`${heldBy("auditor")} of ${actions.length}`}
          detail="Read-only across everything, including the log"
        />
      </div>

      <Card
        title="Who may do what"
        subtitle="A dot means permitted. Where an action is refused, the platform names whose job it is rather than hiding the button — people need to know the thing exists."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-[11px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="sticky left-0 px-1 pb-2 font-medium" style={{ background: "var(--surface-1)" }}>
                  Action
                </th>
                {roles.map((r) => (
                  <th key={r} className="px-1 pb-2 text-center font-medium align-bottom">
                    <span className="inline-block max-w-[5.5rem] leading-tight">{ROLE_LABELS[r]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                  <th
                    scope="row"
                    className="sticky left-0 px-1 py-2 text-left font-normal"
                    style={{ background: "var(--surface-1)" }}
                  >
                    <span className="font-medium">{ACTIONS[a].what}</span>
                    <span className="block" style={{ color: "var(--text-muted)" }}>
                      {a} · belongs to {ACTIONS[a].owner}
                    </span>
                  </th>
                  {roles.map((r) => {
                    const allowed = canDo(r, a);
                    return (
                      <td key={r} className="px-1 py-2 text-center">
                        <span
                          aria-label={allowed ? "permitted" : "refused"}
                          title={
                            allowed
                              ? `${ROLE_LABELS[r]} may ${ACTIONS[a].what.toLowerCase()}`
                              : `${ACTIONS[a].what} belongs to ${ACTIONS[a].owner}`
                          }
                          style={{
                            color: allowed ? "var(--status-good)" : "var(--text-muted)",
                            fontSize: allowed ? "11px" : "10px",
                          }}
                        >
                          {allowed ? "●" : "·"}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Who may see what"
        subtitle="The other half. An item a role cannot reach is not rendered at all rather than shown disabled, because a sidebar full of locked doors is worse than a short one."
      >
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-[11px]">
            <thead>
              <tr style={{ color: "var(--text-muted)" }} className="text-left">
                <th className="px-1 pb-2 font-medium">Screen</th>
                {roles.map((r) => (
                  <th key={r} className="px-1 pb-2 text-center font-medium align-bottom">
                    <span className="inline-block max-w-[5.5rem] leading-tight">{ROLE_LABELS[r]}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NAV_GROUPS.flatMap((group) => {
                const groupItems = NAV.filter((i) => i.group === group);
                if (groupItems.length === 0) return [];
                return [
                  <tr key={`h-${group}`} style={{ background: "var(--wash-neutral)" }}>
                    <th
                      colSpan={roles.length + 1}
                      scope="colgroup"
                      className="px-1 py-1 text-left text-[10px] font-semibold tracking-wide uppercase"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {group}
                    </th>
                  </tr>,
                  ...groupItems.map((item) => (
                    <tr key={item.href} className="border-t" style={{ borderColor: "var(--hairline)" }}>
                      <th scope="row" className="px-1 py-2 text-left font-normal">
                        <span className="font-medium">{item.label}</span>
                        <span className="block" style={{ color: "var(--text-muted)" }}>
                          {item.href}
                          {!item.built && " · planned"}
                        </span>
                      </th>
                      {roles.map((r) => (
                        <td key={r} className="px-1 py-2 text-center">
                          <span
                            aria-label={item.roles.includes(r) ? "visible" : "hidden"}
                            style={{
                              color: item.roles.includes(r) ? "var(--status-good)" : "var(--text-muted)",
                              fontSize: item.roles.includes(r) ? "11px" : "10px",
                            }}
                          >
                            {item.roles.includes(r) ? "●" : "·"}
                          </span>
                        </td>
                      ))}
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="What a page like this cannot do">
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Nothing on this screen is the security. The matrix above is imported by the server actions and
          by the buttons; the buttons are a courtesy so a refusal is visible before it is attempted, and
          the server is the enforcement. For approvals there is a third layer: the database refuses a
          requester approving their own request, anyone deciding a request about themselves, one person
          satisfying two rungs of a chain, and any attempt to mark a request approved while a rung is
          still outstanding. That third layer is the one that survives a bug in the first two.
        </p>
      </Card>
    </div>
  );
}
