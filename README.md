<img src="media/logo.png" width="96" alt="Tether logo">

# Tether

Tether turns "can your team do this for us?" into a date both teams agree on, and keeps that date honest while the work moves.

It lives inside Jira, Confluence and Rovo. There is no new tool to learn and no new board to keep up to date.

The context comes from what Atlassian already knows: which team owns each space, which goals a piece of work serves, how fast each team really finishes work and who is waiting on whom. The confidence is literal. Every promise carries the odds of landing on time, and Tether keeps score of whether those odds turned out to be honest.

**[Watch the demo](https://youtu.be/R0dFpnE9hIQ)** (under five minutes) or **[install Tether on your site](#install-and-try-it)**.

## Why

Most launches don't slip because one team is slow. They slip because one team needed a review, an API or a sign-off from another team, asked for it in a chat thread, got a "sure, should be fine" and planned around it. Weeks later the date quietly moves and nobody downstream finds out until it is too late.

Big companies solve this with dependency contracts in tools like Jira Align. Everyone else has a spreadsheet, a standup and hope.

The signs are easy to find. In Atlassian's [State of Teams 2025](https://www.atlassian.com/blog/state-of-teams-2025) research with 12,000 knowledge workers and 200 executives, leaders and teams said they waste a quarter of their time just searching for answers. Inside Jira, the views that show dependencies across teams belong to [Plans, which needs Jira Premium or Enterprise](https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-roadmaps/). A long standing [suggestion for cross project dependencies](https://jira.atlassian.com/browse/JSWCLOUD-17623) calls the native setup so cumbersome that it is usually not used, and the same question keeps coming back on the [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/How-can-I-manage-cross-team-dependencies-more-effectively-in/qaq-p/2973402).

Tether gives every team on Jira Cloud the same thing, and adds the part that was always missing, a forecast both sides can trust.

## How it works

**Ask.** From any work item, ask another team for what you need and when you need it. Tether finds the team that owns it and the company goals the work is tied to.

**Offer.** The other team sees the ask in their desk with a forecast built from how fast they actually finish work. If your date is unlikely, Tether shows what would actually make it work. That might be a later date, a smaller first slice, going ahead of lower priority work (and it tells you whose promise that pushes back), or the team making room for a couple of weeks.

**Commit.** When they accept, Tether creates the work item in their space, links it to yours and records what was agreed, with the odds at the time.

**Keep.** Every change on either side re-runs the forecast. When a promise drops below the team's threshold, Tether works out why (a slower week, more work landing ahead of it, an upstream team running late) and either proposes new terms or, when the only realistic date is far away, puts the options in front of the owning team instead of guessing.

**Deliver.** Tether shows the pull requests and deployments the Teamwork Graph links to the owning team's work item, and once a production deployment lands it suggests marking the promise delivered. When it closes, the team's track record updates, so the next forecast gets a little more honest.

## Who can answer for a team

Only people who can create and edit work in a team's Jira space, or who are members of that team in Atlassian, can accept, counter or decline on its behalf. Once you tell Tether which teams you're on, you answer only for those, so an admin or anyone on a site with open spaces doesn't end up speaking for every team. Tether checks this on every action, from the app, a Rovo agent or an MCP client, not just in the UI. When an ask arrives, the space lead and the team's members get a normal Jira email, and if nobody answers within two working days they get one reminder.

## The forecast

Tether doesn't ask anyone for estimates. It replays the owning team's real day to day output thousands of times, using the share of their time that usually goes to other teams' asks and whatever is already queued ahead. The chart shows which week each replay finished in and adds them up into the chance of being done by each date. Hover it, or use the arrow keys, to read any day.

When a team has no recent history in Jira, Tether says so and uses the capacity the team set instead. It never pretends.

## Built on Forge

Everything runs on Forge, with nothing hosted outside Atlassian. Forge SQL holds the commitment ledger, async events run the replanner, Realtime keeps every open screen current and a nightly trigger recalibrates forecasts.

Tether shows up where people already work. It sits in the Jira work item panel and sidebar, in a team desk and a cross-team board, in a Confluence macro for launch pages, in Rovo as two agents and three reusable skills, and in any MCP client. Notifications go out as ordinary Jira emails and comments.

## Rovo, MCP and the Teamwork Graph

- **Tether** is a Rovo agent for the asking side. **Tether Desk** helps the owning team answer. Changes such as a new capacity ask the person to confirm first, and the agent then reports the new odds for every promise it moved. Both work through the same actions, and three skills (`raise-ask`, `negotiate-commitment`, `replan-slip`) that any Rovo Studio agent can reuse.
- The same actions are exposed over `rovo:mcp`, so a coding agent in your editor can check what your team is waiting on or raise an ask while you plan a change.
- Tether reads the Teamwork Graph for the teams that own each space, who belongs to each team, the goals a work item serves and the pull requests and deployments linked to it.

## Install and try it

This section walks a judge or a new team from install to every feature in about ten minutes.

### What you need

A Jira Cloud site where you are a site admin. Rovo should be turned on for the site if you want to try the agents. Confluence is optional and adds the launch readiness macro. Tether is free and has no billing.

### Install

1. Open the [installation link](https://developer.atlassian.com/console/install/8943838a-186c-4f4f-99d1-2ee293472e64?signature=AYABeBD2cNqQvMO3JpgzZ5pM3AkAAAADAAdhd3Mta21zAEthcm46YXdzOmttczp1cy13ZXN0LTI6NzA5NTg3ODM1MjQzOmtleS83MDVlZDY3MC1mNTdjLTQxYjUtOWY5Yi1lM2YyZGNjMTQ2ZTcAuAECAQB4CxqLTo9l4lqXuFjNim1xJM%2Bp%2F3TVP9xHS2BrU5DRRucBCMZ%2BovKO5SgebI9IJqb9yAAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDAm2%2F3NEvqkd3jfdbwIBEIA7Fqe2o8YBa4y%2F5ddq%2Fbd2ehoZ8IsNk%2FMYu%2Bm9n1RJYjYNM0hri1Vcex1kd9pWfpZcyfzpz8%2BIGFIP%2BXwAB2F3cy1rbXMAS2Fybjphd3M6a21zOmV1LXdlc3QtMTo3MDk1ODc4MzUyNDM6a2V5LzQ2MzBjZTZiLTAwYzMtNGRlMi04NzdiLTYyN2UyMDYwZTVjYwC4AQICAHi9bVMAkme4qVQX1fQHo6ePw3H40A7cGfz7yrmSfBWMXgHtoMIT%2Bqm1cwVEJ47KXnC2AAAAfjB8BgkqhkiG9w0BBwagbzBtAgEAMGgGCSqGSIb3DQEHATAeBglghkgBZQMEAS4wEQQMuTY1uxKJzX0GN1MNAgEQgDvwI8L2YftJO9zEoFQgo2EJ%2F2Cv9NNNqKrhHyww3yFsWdyTveBozBrrFycFkn48y%2Fu0ZDtXc81s70iYlQAHYXdzLWttcwBLYXJuOmF3czprbXM6dXMtZWFzdC0xOjcwOTU4NzgzNTI0MzprZXkvNmMxMjBiYTAtNGNkNS00OTg1LWI4MmUtNDBhMDQ5NTJjYzU3ALgBAgIAeDYASx0XCjkny4iLV6vz%2BKtEGSGT6kdt0QRpkn6D%2FlVEAdrxsdza%2FxyQmMBQ83VlHB0AAAB%2BMHwGCSqGSIb3DQEHBqBvMG0CAQAwaAYJKoZIhvcNAQcBMB4GCWCGSAFlAwQBLjARBAx9azf6cQ2rEWdjBmgCARCAO%2F3%2FlvJ8EpTZTZpPG7KiOeGNAzlWZrB8N9oBkV1IGvXwI1L%2FIGYo9kb4feOwO2MVZ0C4HquIOlGAeJwoAgAAAAAMAAAQAAAAAAAAAAAAAAAAAMZfz%2Fyb0Yi6K3D1Kum7647%2F%2F%2F%2F%2FAAAAAQAAAAAAAAAAAAAAAQAAADK6BYdcXpNPN0CwY8EuTCBs3M3Qr%2F9iO%2FhtFHq5Qjj7kR6VxKR%2FmrWryl0A77qBPoGAxFeoiPUt2AGx2hJhijPQfc8%3D&product=jira&product=confluence).
2. Pick your site and install into Jira, then into Confluence if you have it.
3. Approve the permissions when Atlassian asks. If your organisation asks for approval of the Teamwork Graph scopes, approve those too.
4. In Jira open **Apps** in the sidebar and choose **Tether**.

### Build a sample launch

Your site probably has no cross team asks yet, so Tether can make a small one for you.

1. On the Tether page choose **Across teams** and click **Build a sample launch**.
2. Wait about a minute. Tether picks spaces on your site, creates a few work items labelled `tether-sample` and raises asks between them, with marketing asking legal, platform, design and security, and platform asking security in turn.
3. The board fills in with every promise, the most at risk first.

When you are done, **Remove sample launch** takes out everything the sample created.

### A five minute tour

1. **The board.** On **Across teams**, open any row. You see the forecast chart, the arithmetic behind it, the options that would make the date work and the history of the promise. The gap column shows how far each forecast sits from its promise, purple when comfortably early and red when well behind.
2. **A team's desk.** Choose **Your team** and pick a team you can work in. Asks waiting for that team appear first with a suggested answer. Use **Commit**, **Counter** or **Decline**, and open **Team policy** to change capacity or the share of time given to asks.
3. **Raise your own ask.** Open any work item, then **More actions** and **Ask another team**. Pick a team, a date and the number of pieces of work, and watch the odds and the options change before you send it.
4. **The work item panel.** On a work item, open the app actions and choose **Tether**. The panel shows when everything the item needs from other teams will land. The **Tether** glance in the sidebar shows the same answer in one line.
5. **Answering for another team.** Once you pick your team, Tether only lets you answer for that team, the same way it works for a real colleague. To answer as a second team, open its desk from **Another team…** and choose **I'm on this team**.
6. **Confluence.** On any page type `/Tether`, choose **Tether launch readiness**, enter a work item key and publish. The page shows the live readiness for that launch.

### Rovo agents

Open **Ask Rovo**, open the agent list and pick **Tether** or **Tether Desk**. Try "What is waiting on my team, and is anything we promised slipping?" with Tether Desk, or "We're at an offsite next week, drop our capacity to 3 items a week". Changes ask you to confirm first. From a work item panel, **Ask in Rovo** opens the Tether agent with that item in context.

### MCP

A site admin turns on the Tether tools under **Atlassian Administration**, **Apps**, **Connected apps**. Then add `https://mcp.atlassian.com/forge/8943838a-186c-4f4f-99d1-2ee293472e64` as a remote MCP server in a client such as Cursor and sign in when it asks. The twelve tools match the Rovo actions.

### If something looks off

- **No agents in Rovo.** Rovo has to be active on the site, and new apps can take a few minutes to appear in the agent list.
- **No goals on asks.** Goals come from Atlassian Goals through the Teamwork Graph, so you only see them for work items linked to goals you can see.
- **A team is missing from the picker.** Tether lists teams that own a Jira space. Use **Refresh teams** after adding a space.
- **Forecasts say they use declared capacity.** That means the space has no recently finished work yet. Tether says so on the desk and uses the capacity in **Team policy** until history builds up.

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
