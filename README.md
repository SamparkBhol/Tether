<img src="media/logo.png" width="96" alt="Tether logo">

# Tether

Tether turns "can your team do this for us?" into a date both teams agree on, and keeps that date honest while the work moves.

It lives inside Jira, Confluence and Rovo. There is no new tool to learn and no new board to keep up to date.

The context comes from what Atlassian already knows: which team owns each space, which goals a piece of work serves, how fast each team really finishes work and who is waiting on whom. The confidence is literal. Every promise carries the odds of landing on time, and Tether keeps score of whether those odds turned out to be honest.

## Why

Most launches don't slip because one team is slow. They slip because one team needed a review, an API or a sign-off from another team, asked for it in a chat thread, got a "sure, should be fine" and planned around it. Weeks later the date quietly moves and nobody downstream finds out until it is too late.

Big companies solve this with dependency contracts in tools like Jira Align. Everyone else has a spreadsheet, a standup and hope.

Tether gives every team on Jira Cloud the same thing, and adds the part that was always missing, a forecast both sides can trust.

## How it works

**Ask.** From any work item, ask another team for what you need and when you need it. Tether finds the team that owns it and the company goals the work is tied to.

**Offer.** The other team sees the ask in their desk with a forecast built from how fast they actually finish work. If your date is unlikely, Tether shows what would actually make it work. That might be a later date, a smaller first slice, going ahead of lower priority work (and it tells you whose promise that pushes back), or the team making room for a couple of weeks.

**Commit.** When they accept, Tether creates the work item in their space, links it to yours and records what was agreed, with the odds at the time.

**Keep.** Every change on either side re-runs the forecast. When a promise drops below the team's threshold, Tether works out why (a slower week, more work landing ahead of it, an upstream team running late) and either proposes new terms or, when the only realistic date is far away, puts the options in front of the owning team instead of guessing.

**Deliver.** When the work is done, the promise closes and the team's track record updates, so the next forecast gets a little more honest.

## Who can answer for a team

Only people who can create and edit work in a team's Jira space, or who are members of that team in Atlassian, can accept, counter or decline on its behalf. Tether checks this on every action, not just in the UI. When an ask arrives, the space lead and the team's members get a normal Jira email, and if nobody answers within two working days they get one reminder.

## The forecast

Tether doesn't ask anyone for estimates. It replays the owning team's real day to day output thousands of times, using the share of their time that usually goes to other teams' asks and whatever is already queued ahead. The chart shows which week each replay finished in and adds them up into the chance of being done by each date. Hover it, or use the arrow keys, to read any day.

When a team has no recent history in Jira, Tether says so and uses the capacity the team set instead. It never pretends.

## Built on Forge

Everything runs on Forge, with nothing hosted outside Atlassian. Forge SQL holds the commitment ledger, async events run the replanner, Realtime keeps every open screen current and a nightly trigger recalibrates forecasts.

Tether shows up where people already work. It sits in the Jira work item panel and sidebar, in a team desk and a cross-team board, in a Confluence macro for launch pages, in Rovo as two agents and three reusable skills, and in any MCP client. Notifications go out as ordinary Jira emails and comments.

## Rovo, MCP and the Teamwork Graph

- **Tether** is a Rovo agent for the asking side. **Tether Desk** helps the owning team answer. Both work through the same actions, and three skills (`raise-ask`, `negotiate-commitment`, `replan-slip`) that any Rovo Studio agent can reuse.
- The same actions are exposed over `rovo:mcp`, so a coding agent in your editor can check what your team is waiting on or raise an ask while you plan a change.
- Tether reads the Teamwork Graph for the teams that own each space, the goals a work item serves and the deployments linked to it.

## Install

You need a Jira Cloud site with Rovo. Confluence is optional and adds the launch readiness macro.

1. Open the installation link and install into Jira, then Confluence if you use it.
2. An org admin approves the Teamwork Graph scopes during install.
3. Open **Apps > Tether** and pick your team.

To see it working before anyone raises a real ask, open **Across teams** and choose **Build a sample launch**. Tether creates a small launch in your own spaces, with marketing asking legal, platform, design and security for what it needs and platform asking security in turn. Everything it creates is labelled `tether-sample` and comes out again with **Remove sample launch**.

## Use it from your editor

Tether's tools are available to any MCP client that supports remote servers with sign-in, such as Cursor or VS Code.

1. A site admin turns on the Tether tools under **Atlassian Administration > Apps > Connected apps**.
2. Add `https://mcp.atlassian.com/forge/8943838a-186c-4f4f-99d1-2ee293472e64` as a remote MCP server in your client and sign in when it asks.
3. Ask things like "what is PLAT-311 waiting on" or "ask Legal for a review of the export terms by Dec 12".

When a coding agent raises an ask it says so, and the owning team sees which client asked on whose behalf.

## Automation recipes

Tether's agents can sit inside the Automation rules you already have. A few that work well:

- **Monday slip digest.** Scheduled every Monday, then "Use Rovo agent" with Tether Desk and the prompt "List my team's promises that are slipping and what each one needs". Send the result to your team channel.
- **Ask on label.** When a work item gets the label `needs-legal`, use the Tether agent with "Draft an ask to Legal for {{issue.key}}, needed by {{issue.duedate}}". Tether drafts it and a person confirms.
- **Launch readiness check.** When a launch epic moves to In review, ask Tether "What is {{issue.key}} waiting on from other teams and how likely is all of it by {{issue.duedate}}" and post the answer as a comment.

## Develop

```bash
npm install
npm --prefix static/ui install
npm run deploy
forge install --site <your-site>.atlassian.net --product jira
```

The backend lives in `src` and is grouped by what it does. `domain` holds the commitment state machine, `engine` does forecasting, negotiation and propagation, `services` has the use cases, `store` talks to Forge SQL, and `jira` and `graph` wrap the APIs. The UI is a single Custom UI app in `static/ui` that renders every module.

## Privacy

Tether runs on Atlassian. It stores asks, commitments and forecast snapshots in Forge SQL inside your site, and sends nothing anywhere else.

Every read happens as the person looking, so nobody sees a team, a work item or a goal through Tether that Jira wouldn't already show them. Live updates carry only ids and states, never titles or descriptions, and every screen refetches through those permission checked calls when something changes.

## License

MIT
