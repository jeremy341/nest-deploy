import type { ReactNode } from "react";
import { REPO_URL } from "@/lib/site";
import { CodeBlock } from "../_components/code-block";
import {
  B,
  C,
  Callout,
  ExternalLink,
  H3,
  InternalLink,
  List,
  P,
  Section,
  Table,
} from "../_components/prose";

const setupDoc = `${REPO_URL}/blob/main/docs/backend-setup.md`;

/**
 * The body of each docs page, by section id. Titles come from `_data/nav.ts`,
 * so a heading is never typed twice. Each entry renders one whole page.
 */
export const CONTENT: Record<string, () => ReactNode> = {
  overview: () => (
    <Section
      id="overview"
      intro="Nest Deploy is a dashboard that builds your GitHub repository and runs it on your free Hack Club Nest container. It is an independent project, not an official Hack Club product."
    >
      <P>
        Nest gives each member a small Linux container that you reach over SSH. Nest Deploy connects to that
        container with a key you control, uploads a finished build, and runs it as a systemd service on a
        port. Nest&apos;s own proxy then maps your domain to that port. Nest Deploy does the work you would
        otherwise do by hand in a terminal.
      </P>
      <H3 id="overview-push" />
      <List ordered>
        <li>GitHub tells Nest Deploy about the push.</li>
        <li>The deployment joins a queue. Only one deployment per project runs at a time.</li>
        <li>
          A worker clones your repository and builds it in a sandbox on the Nest Deploy side, so your
          container&apos;s memory is kept for your app.
        </li>
        <li>The finished release is uploaded to your container over SSH and unpacked into its own folder.</li>
        <li>
          Production dependencies are installed there, your environment variables are written to the server,
          and the service is restarted on your port.
        </li>
        <li>
          Nest Deploy waits for the app to answer on its port. If it never does, the previous release is put
          back and the deployment is marked as failed.
        </li>
      </List>
      <P>
        Pushes to your production branch go live. Pushes to any other branch build a preview on a port of its
        own.
      </P>
      <Callout tone="note" title="What it does not do">
        It does not run databases, provide a public preview address without a domain, or guarantee that any
        arbitrary application works on Nest. It runs the runtimes listed under Projects and runtimes, and
        anything with a start command that listens on the <C>PORT</C> it is given.
      </Callout>
    </Section>
  ),

  quickstart: () => (
    <Section id="quickstart" intro="From nothing to a deployed app in four steps.">
      <List ordered>
        <li>
          <B>Sign in.</B> Log in with your Hack Club
          account. It confirms who you are and has no route to your container.
        </li>
        <li>
          <B>Connect your server.</B> Open Connect, enter
          your Nest username, and copy the public key shown. Paste it into the SSH Keys page of your Nest
          dashboard, then press Test connection.
        </li>
        <li>
          <B>Import a repository.</B> Choose New project.
          Install the Nest Deploy GitHub app on the repositories you want to use, pick one, and review the
          settings Nest Deploy detected: runtime, port and commands.
        </li>
        <li>
          <B>Deploy.</B> Press Deploy. Watch the build
          log stream in. After that, every push to your production branch deploys on its own.
        </li>
      </List>
      <Callout tone="warning" title="Your app has to listen on the right port">
        Nest Deploy starts your app with <C>PORT</C> set to the port you chose and <C>HOST</C> set to{" "}
        <C>0.0.0.0</C>. Listen on both. An app that binds only to <C>localhost</C> cannot be reached by
        Nest&apos;s proxy, and the health check will fail.
      </Callout>
    </Section>
  ),

  servers: () => (
    <Section
      id="servers"
      intro="A server is one Nest account. You can connect more than one, and each has its own projects and usage."
    >
      <H3 id="servers-connection" />
      <P>
        Nest Deploy makes a dedicated ed25519 key for each server, used for nothing else. You paste the public
        half into the Nest dashboard. Nest&apos;s bastion routes the connection to your container as{" "}
        <C>root</C>, so this key can do anything you can do there. Nest Deploy says so before you add it.
      </P>
      <P>
        The private key is encrypted with AES-256-GCM before it is stored and is tied to that server so it
        cannot be moved to another. It is never shown. The first connection records Nest&apos;s host key, and
        if it ever changes Nest Deploy stops before sending anything.
      </P>
      <H3 id="servers-manage" />
      <List>
        <li>
          <B>Test connection</B> connects, records the
          host key, and reads what your container has: operating system, Node.js and Python versions, systemd,
          and CPU, memory and disk. Anything missing that deployments need is listed as an issue.
        </li>
        <li>
          <B>Rotate key</B> replaces the key with a new
          one. The server goes back to pending until you paste the new public key and test again.
        </li>
        <li>
          <B>Remove a server</B> deletes its records here.
          Apps already running on the container keep running.
        </li>
      </List>
      <Callout tone="note" title="Taking access back">
        Delete the key in your Nest dashboard. Access ends at once and your apps keep running, because they are
        ordinary services in your container. Nest Deploy just cannot update them any more.
      </Callout>
    </Section>
  ),

  projects: () => (
    <Section
      id="projects"
      intro="A project ties one repository to one app on one server."
    >
      <H3 id="projects-settings" />
      <Table
        caption="Settings"
        head={["Setting", "What it does", "Default"]}
        rows={[
          ["Production branch", "Pushes here deploy to production.", <C key="b">main</C>],
          ["Root directory", "The folder inside the repository to build, for monorepos.", <C key="r">.</C>],
          ["Runtime", "How to install, build and run it. See below.", "Detected"],
          ["Install, build, start", "Override any command. Each must be a single line.", "Detected"],
          ["Output directory", "Static sites only: the folder to serve.", "The root"],
          ["Port", "The port the app listens on. Unique per server.", "You choose"],
          ["Health path", "The path requested to decide the app is up.", <C key="h">/</C>],
          ["Deploy automatically", "Build on every push to a branch.", "On"],
        ]}
      />
      <H3 id="projects-runtimes" />
      <Table
        caption="Runtimes"
        head={["Runtime", "Install and build", "Default start"]}
        rows={[
          [
            "Node.js",
            "Reads your lockfile to choose npm, pnpm or yarn and installs from it (npm install if there is none). Runs your build script if you have one. Production dependencies are installed again on your container.",
            <C key="n">npm start</C>,
          ],
          [
            "Python",
            "Creates a virtual environment on your container and installs requirements.txt into it.",
            <C key="p">python3 app.py</C>,
          ],
          [
            "Static site",
            "Builds if there is a build script, then serves the output folder with Python 3, or Node.js if Python is missing.",
            "A built-in file server",
          ],
          ["Any command", "Skips detection. You give the install, build and start commands yourself.", "Your command"],
        ]}
      />
      <H3 id="projects-guarantees" />
      <List>
        <li>
          It runs from its release folder, with <C>PORT</C>, <C>HOST=0.0.0.0</C> and <C>NODE_ENV=production</C>{" "}
          set.
        </li>
        <li>systemd restarts it three seconds after it exits, so a crash is not the end of the app.</li>
        <li>
          It sees your environment variables. The names <C>PORT</C>, <C>HOST</C>, <C>PATH</C>, <C>HOME</C> and{" "}
          <C>NEST_DEPLOY</C> are reserved.
        </li>
      </List>
    </Section>
  ),

  deployments: () => (
    <Section
      id="deployments"
      intro="Every build is a deployment, with its own log, commit and port. Production and preview deployments are kept separate."
    >
      <H3 id="deployments-states" />
      <Table
        caption="States"
        head={["State", "Meaning"]}
        rows={[
          ["Queued", "Waiting. A project runs one deployment at a time."],
          ["Building", "Cloning, installing and building in the sandbox."],
          ["Deploying", "Uploading, starting the service and waiting for it to answer."],
          ["Ready", "Built, started and answering."],
          ["Error", "A step failed. The log says which, and the previous release is restored."],
          ["Canceled", "Stopped by you, or because its pull request closed."],
        ]}
      />
      <H3 id="deployments-actions" />
      <List>
        <li>
          <B>Deploy</B> builds a branch now.{" "}
          <B>Redeploy</B> builds the same commit again.
        </li>
        <li>
          <B>Cancel</B> stops a queued or running
          deployment.
        </li>
        <li>
          <B>Rollback</B> points production back at an
          earlier ready release that is still on your server. It switches a symlink and restarts the service,
          so it takes seconds. It does not reverse database changes or other outside state.
        </li>
        <li>
          <B>Restart</B> restarts the running service
          without building anything. It is on the Service card of the project page.
        </li>
      </List>
      <P>
        The Deployments page can be searched by commit message, branch, author, project or pull request (type{" "}
        <C>#14</C>), and narrowed by status, environment, project and time. It sorts by newest, oldest or build
        time, and shows 25 at a time with a Show more button.
      </P>
      <H3 id="deployments-releases" />
      <P>
        Production keeps your last five releases and the one that is live. Previews keep the newest two; older
        ones are stopped and deleted. A release that was removed cannot be rolled back to.
      </P>
      <H3 id="deployments-previews" />
      <P>
        Any branch other than production builds as a preview on its own port, starting at 20000. Nest does not
        give previews a public address on its own. To share one, map a domain to its port in the Nest
        dashboard.
      </P>
      <Callout tone="tip" title="Failed deploys are safe">
        If the new release never answers on its port, production is put back on the release that was live
        before. You are never left on a broken version by a failed deploy.
      </Callout>
    </Section>
  ),

  env: () => (
    <Section
      id="env"
      intro="Set once per project. They are encrypted, masked in logs, and never shown again in full."
    >
      <List>
        <li>
          A name uses letters, digits and underscores and does not start with a digit. Each variable applies to
          All deployments, Production only, or Preview only.
        </li>
        <li>Values are encrypted when stored and written to your server when you deploy. They are also available to the build.</li>
        <li>
          To change a value, use the pencil next to its name and enter a new one. Saving the same name and
          target again replaces the old value.
        </li>
        <li>A change takes effect on the next deployment. Redeploy to apply it now.</li>
        <li>A project can have up to 100 variables.</li>
      </List>
      <Callout tone="warning" title="Secrets in logs">
        Values are masked wherever they would appear in build or deploy output. Do not print secrets from your
        own code and expect the mask to catch every form of them.
      </Callout>
    </Section>
  ),

  logs: () => (
    <Section id="logs" intro="Two kinds: what the build printed, and what your running app prints.">
      <List>
        <li>
          <B>Build logs</B> belong to a deployment. They
          stream to the page as the build runs and stay afterwards.
        </li>
        <li>
          <B>Runtime logs</B> are read from your
          service&apos;s journal on the container. Open the Logs page and choose a project. It shows the latest
          300 lines and can refresh every five seconds.
        </li>
        <li>
          <B>Search</B> asks the server and looks through
          the last 1000 lines, so a match is not limited to the lines already on screen.
        </li>
      </List>
    </Section>
  ),

  domains: () => (
    <Section
      id="domains"
      intro="Nest maps domains to ports on its own dashboard and has no API for it. So Nest Deploy tells you exactly what to enter, and checks DNS until it matches."
    >
      <List ordered>
        <li>
          On the Domains page, add the domain and the port it should reach. Pick a project to fill in its port.
        </li>
        <li>
          At your DNS provider, create a CNAME record for the domain pointing to{" "}
          <C>your-nest-username.hackclub.app</C>. Names that already end in <C>.hackclub.app</C> skip this.
        </li>
        <li>In the Domains page of your Nest dashboard, add the domain and set its target port.</li>
        <li>Return and press Check. The domain becomes Valid when DNS points where it should.</li>
      </List>
      <P>
        You can change a domain&apos;s project or port later with the pencil button. Changing the port resets
        its status and reminds you to make the same change in the Nest dashboard. A domain that needs attention
        shows why after a check.
      </P>
    </Section>
  ),

  github: () => (
    <Section
      id="github"
      intro="Nest Deploy reads your code through a GitHub app that you install on chosen repositories."
    >
      <H3 id="github-push" />
      <P>
        With Deploy automatically on, a push to the production branch deploys to production and a push to any
        other branch builds a preview. Public or private repositories both work, for whatever you grant the app.
        The same commit is not built twice while a build for it is already running.
      </P>
      <H3 id="github-pr-previews" />
      <List>
        <li>
          A pull request from the same repository links to its preview and gets one comment from the app, which
          is updated as the build finishes. The comment gives the state, the commit and a link that only you
          can open. It never includes error output or server details.
        </li>
        <li>Closing the pull request cancels a build in progress and removes its previews from your server.</li>
        <li>
          Pull requests from forks, draft pull requests, and pull requests from the production branch are not
          built. Building a fork would run a stranger&apos;s code with your environment variables.
        </li>
      </List>
      <Callout tone="note" title="Permissions for the comment">
        Commenting needs the app to have Pull requests read and write access and to subscribe to Pull request
        events. Without it, previews still build and the comment is simply skipped.
      </Callout>
    </Section>
  ),

  hooks: () => (
    <Section
      id="hooks"
      intro="A private URL that starts a deployment when it receives a POST. Use it from CI, a cron job or a script."
    >
      <CodeBlock label="Terminal" code={`curl -X POST https://your-nest-deploy/api/hooks/deploy/ndh_...`} />
      <List>
        <li>The URL is shown once, when you create it. Only a hash of it is stored.</li>
        <li>
          An optional JSON body picks a branch: <C>{`{ "branch": "my-branch" }`}</C>. A branch other than
          production builds as a preview.
        </li>
        <li>A successful call answers 202 with the new deployment. Calling it while a deployment runs answers 409.</li>
        <li>Making a new URL, or revoking the hook, stops the old URL working at once.</li>
      </List>
      <Callout tone="warning" title="Treat it like a password">
        Anyone with the URL can deploy that project. If it leaks, make a new one.
      </Callout>
    </Section>
  ),

  notifications: () => (
    <Section
      id="notifications"
      intro="Messages to a Discord or Slack channel from an incoming webhook."
    >
      <List>
        <li>
          Choose All deployments or Failures only. A message says whether the project went live or failed, the
          branch and commit, and links to the deployment.
        </li>
        <li>
          The same webhook also receives an alert when an app stops answering and another when it recovers. See
          Monitoring.
        </li>
        <li>Send a test message after saving, to confirm the URL works before relying on it.</li>
        <li>
          Only <C>discord.com</C> and <C>hooks.slack.com</C> webhook URLs are accepted, over https. The URL is
          stored encrypted and never shown again.
        </li>
      </List>
    </Section>
  ),

  monitoring: () => (
    <Section
      id="monitoring"
      intro="What your app is doing now, and what it has been doing."
    >
      <H3 id="monitoring-service-card" />
      <P>
        On a project&apos;s page: whether the service is running, its uptime and memory, how many times systemd
        restarted it, and one real request to the health path. It refreshes every 30 seconds while the tab is
        visible. Check now reads it on demand, and Restart restarts the service after you confirm.
      </P>
      <H3 id="monitoring-resources" />
      <P>
        Memory and CPU of this one service over the last 24 hours, taken from systemd&apos;s accounting. CPU is a
        share of a single core, so it can pass 100. Where a reading cannot be worked out honestly, such as just
        after a restart, there is a gap rather than a guess. The Resources page in the sidebar shows load,
        memory and disk for the whole server over the last 24 hours or 7 days, with each project&apos;s own memory
        and CPU in a table below. The Projects page keeps a compact copy of the current figures.
      </P>
      <H3 id="monitoring-uptime" />
      <List>
        <li>
          The worker checks every live production project every five minutes. A project counts as up when its
          service is running and its health path answers with anything below a server error.
        </li>
        <li>
          It is declared down after two failed checks in a row, so one slow answer does not raise an alarm. You
          get one message when it goes down and one when it recovers.
        </li>
        <li>A project is skipped while it is being deployed. A server that cannot be reached is not reported as an app being down.</li>
        <li>
          The overview&apos;s Alerts card lists apps that are not answering, failed deployments, and a disk or
          memory that is over 90% used.
        </li>
      </List>
    </Section>
  ),

  "status-page": () => (
    <Section
      id="status-page"
      intro="A public page that says whether an app is answering."
    >
      <P>
        Publish it from a project&apos;s settings. Anyone with the link can see the project&apos;s name, whether
        it is operational, how long it has been that way, the share of the last 30 days it was answering, and
        recent outages. It shows nothing else: no repository, port, server or commit. The address contains an
        unguessable key, and unpublishing makes the old link stop working.
      </P>
      <P>
        The figures come from the five-minute checks, so a very short outage can be missed. Until checks have
        run, the page says there is no data yet instead of showing a percentage.
      </P>
      <P>
        Under the percentage is a strip with one square for each of the last 30 days, in UTC. Green means the app
        answered all day. Amber means it was down for part of the day. Red means it was down for more than half of
        it. Grey means no checks had run yet. Hover a square, or use a screen reader, to see the minutes.
      </P>
    </Section>
  ),

  api: () => (
    <Section
      id="api"
      intro="Access tokens let a script or an AI agent act for you, with only the permissions you pick. Everything here is also in the OpenAPI description."
    >
      <H3 id="api-tokens" />
      <P>
        Open Developer in the sidebar and press <B>Create token</B>. The form opens in a dialog. Give the token a
        name you will recognise later, tick the permissions it needs, and pick how long it lasts: 7, 30, 90 or 365
        days. The secret is shown once, so copy it before you close the dialog. You can have up to 25 active tokens.
      </P>
      <P>
        The two quick picks save time. <B>Read only</B> ticks every permission that only reads. <B>Deploy</B> ticks
        what a deploy script needs: reading projects, deployments and logs, and starting deployments. Clear the list
        and tick by hand for anything else.
      </P>
      <H3 id="api-scopes" />
      <P>The permissions are grouped by the part of Nest Deploy they touch:</P>
      <List>
        <li>
          <B>Projects, deployments and logs.</B> Read them, start or redeploy, roll back and cancel. Starting a build
          is marked, because it runs code on your container.
        </li>
        <li>
          <B>Environment variables.</B> Read the names, or set and remove them. The values are never sent back.
        </li>
        <li>
          <B>Domains, alerts and notifications, analytics, resources and activity.</B> Read or change, each on its
          own permission.
        </li>
        <li>
          <B>Container.</B> Read the servers and what is on them. Nothing on the container is changed by this
          permission.
        </li>
        <li>
          <B>Files and terminal.</B> Only useful once you have switched them on for a server. See the next part.
        </li>
      </List>
      <H3 id="api-limits" />
      <P>
        Terminal and file changes are off until you switch them on for a server, and switching them on asks you to
        sign in with Hack Club again. A token can use them only while that switch is on. A token that holds either
        permission expires within 7 days, whatever length you picked, and the form shows that as you tick it.
      </P>
      <P>
        Some things stay with you in the browser. A token cannot remove leftovers on the container, change the
        container permissions, or manage your account, sessions or other tokens.
      </P>
      <H3 id="api-mcp" />
      <P>
        The API is under <C>/api/v1</C> and takes the token as a bearer header. The description of every call is at
        <C>/api/v1/openapi.json</C>. AI agents can instead connect to the MCP endpoint at <C>/api/mcp</C>, which
        offers the same calls as tools.
      </P>
      <CodeBlock
        label="Terminal"
        code={`curl -H "Authorization: Bearer ndp_..." https://your-nest-deploy/api/v1/projects`}
      />
      <P>
        Deploys, redeploys, rollbacks, cancels and file or terminal actions are recorded in Activity with the token
        that made them, so you can tell a script&apos;s change from your own.
      </P>
    </Section>
  ),

  analytics: () => (
    <Section
      id="analytics"
      intro="Page views for your site, counted by a small script. Nest does not share its web server logs, so the numbers have to come from the page itself."
    >
      <H3 id="analytics-setup-steps" />
      <List ordered>
        <li>Open a project&apos;s Analytics page and turn analytics on.</li>
        <li>Copy the script tag into the head of every page you want counted.</li>
        <li>Redeploy, and visit a page.</li>
      </List>
      <CodeBlock
        label="HTML"
        code={`<script defer data-key="nda_..." src="https://your-nest-deploy/api/analytics/script"></script>`}
      />
      <H3 id="analytics-data" />
      <P>
        Page views and visitors for the last 30 days, a bar for each day, your top pages, and the sites visitors
        came from. Visitors are counted per day, so someone who comes on two days counts twice.
      </P>
      <H3 id="analytics-privacy" />
      <List>
        <li>It records the page path and the referring site, and nothing else.</li>
        <li>No cookies, and no IP address or browser details are stored.</li>
        <li>
          A visitor is a hash that changes every day, so a day&apos;s visitors can be counted but nobody can be
          followed across days.
        </li>
        <li>
          It stays quiet for browsers that send Do Not Track and on localhost. Known bots are not counted.
          History is kept for 90 days.
        </li>
      </List>
    </Section>
  ),

  activity: () => (
    <Section id="activity">
      <List>
        <li>
          <B>Activity</B> lists changes made to your
          projects, domains and servers, newest first: deploys, rollbacks, restarts, settings and variables
          changes, and the monitor&apos;s down and recovery events.
        </li>
        <li>
          <B>Account</B> shows your Hack Club profile
          (read-only), the GitHub accounts where the app is installed, and every browser you are signed in on,
          with a way to sign out one or all of the others.
        </li>
        <li>
          <B>Delete account</B> removes your projects,
          servers, domains, keys and history from Nest Deploy after you type your name. Apps already on your
          container keep running, but nothing manages them. Delete the key in your Nest dashboard as well.
        </li>
      </List>
    </Section>
  ),

  security: () => (
    <Section
      id="security"
      intro="The key you give Nest Deploy is powerful, so here is exactly how it is handled."
    >
      <Table
        caption="Security"
        head={["Area", "How it works"]}
        rows={[
          ["The SSH key", "One ed25519 key per server, sealed with AES-256-GCM, tied to that server, never displayed."],
          ["Host key", "Recorded on first connection. If it changes, Nest Deploy stops before sending anything."],
          ["Access", "A root shell in your own container. Delete the key in the Nest dashboard to end it."],
          ["Builds", "Run in a sandbox on the Nest Deploy side. The source is deleted when the build ends."],
          ["Secrets", "Encrypted at rest, masked in logs, never sent back to your browser."],
          ["Sign-in", "Hack Club Auth proves who you are. It has no route to your container."],
          ["Requests", "Changes from the browser are checked to come from this site. Sessions are stored hashed."],
          ["Hooks", "A hook URL is stored only as a hash. GitHub events are verified with a shared secret."],
          ["Forks", "Pull requests from forks are never built."],
        ]}
      />
      <P>
        Three addresses are public on purpose: the analytics script and its collector, and status pages.
        Collecting a page view writes one row and returns nothing, and a status page shows only what is
        described above.
      </P>
    </Section>
  ),

  selfhost: () => (
    <Section
                id="selfhost"
                intro="Nest Deploy is open source. You can run your own copy instead of using a hosted one."
              >
                <P>
                  The web app is a Next.js app with a SQLite database and a worker that runs builds and checks. For a
                  quick local start with a fake login and a stand-in container, no accounts needed:
                </P>
                <CodeBlock
                  label="Terminal"
                  code={`cd web
    pnpm install
    pnpm setup     # writes .env.local with a fresh APP_SECRET
    pnpm dev       # http://localhost:3000, with the worker built in`}
                />
                <Table
                  caption="Self-hosting variables"
                  head={["Variable", "Purpose"]}
                  rows={[
                    [<C key="1">APP_SECRET</C>, "32 or more characters. Encrypts keys and variables. Back it up: losing or changing it makes stored keys unreadable."],
                    [<C key="2">APP_URL</C>, "The public address, used for sign-in redirects, links and hook URLs."],
                    [<C key="3">DATABASE_URL</C>, "SQLite file. Migrations apply on startup."],
                    [<C key="4">HACKCLUB_CLIENT_ID / SECRET</C>, "From a Hack Club Auth app, for sign-in."],
                    [<C key="5">GITHUB_APP_*</C>, "The GitHub app: id, slug, client id and secret, private key and webhook secret."],
                    [<C key="6">BUILD_RUNNER</C>, "docker isolates builds. local runs them on the same machine and is for your own projects only."],
                    [<C key="7">BUILD_TIMEOUT_SECONDS</C>, "How long a build may run. Default 900."],
                    [<C key="8">MONITOR_INTERVAL_MS</C>, "How often uptime is checked. Default 300000 (five minutes). 0 turns it off."],
                  ]}
                />
                <P>
                  The worker runs inside the web process in development. In production run <C>pnpm worker</C>, optionally
                  on a separate machine from the website. Registering the apps and the full list of settings are in the{" "}
                  <ExternalLink href={setupDoc}>backend setup guide</ExternalLink>
                  .
                </P>
              </Section>
  ),

  limits: () => (
    <Section id="limits">
      <Table
        caption="Limits"
        head={["What", "Limit"]}
        rows={[
          ["Deployments per project", "One at a time. Others wait in the queue."],
          ["Production releases kept", "The last five, plus the live one."],
          ["Previews kept", "The newest two."],
          ["Preview ports", "20000 to 29999 on each server."],
          ["Environment variables", "100 per project."],
          ["Build time", "15 minutes by default."],
          ["Uptime checks", "Every 5 minutes. Down after two failures in a row."],
          ["Usage and resource history", "7 days kept, 24 hours shown."],
          ["Analytics history", "90 days."],
          ["Your container", "Nest sets it: 2 vCPU, 2 GB of memory and 16 GB of disk by default."],
        ]}
      />
    </Section>
  ),

  troubleshooting: () => (
    <Section id="troubleshooting">
      <H3 id="troubleshooting-connection" />
      <P>
        Check that the public key was pasted into the SSH Keys page of the Nest dashboard exactly as shown, and
        that the Nest username is right. If you rotated the key, paste the new one. If the host key changed,
        Nest Deploy refuses to continue on purpose.
      </P>
      <H3 id="troubleshooting-build" />
      <P>
        Open the deployment and read the log. The usual causes are a missing lockfile or build script, a wrong
        root directory for a monorepo, or a command that needs a variable you have not set. Builds run in a
        clean sandbox, so something that only works on your own machine will fail there.
      </P>
      <H3 id="troubleshooting-no-answer" />
      <P>
        The app has to listen on the <C>PORT</C> it is given and on <C>0.0.0.0</C>, not only on localhost. Check
        that the health path returns a response that is not a server error. The log prints the last lines of the
        app&apos;s output when this happens, and the previous release is restored.
      </P>
      <H3 id="troubleshooting-domain" />
      <P>
        DNS can take a while to spread. Confirm the CNAME points to your Nest address, and that you also added
        the domain and the right port in the Nest dashboard. Press Check again afterwards.
      </P>
      <H3 id="troubleshooting-hook-409" />
      <P>A deployment for that project is already running. Try again when it finishes.</P>
      <H3 id="troubleshooting-pr-comment" />
      <P>
        The pull request must come from the same repository and not be a draft, and the GitHub app needs Pull
        requests read and write access with Pull request events turned on.
      </P>
      <H3 id="troubleshooting-alerts" />
      <P>
        Send a test message from the project&apos;s notification settings. If that works, the app has not gone
        down for two checks in a row yet.
      </P>
      <Callout tone="note" title="Still stuck?">
        Look at <InternalLink href="/projects">your dashboard</InternalLink> or open an issue on{" "}
        <ExternalLink href={REPO_URL}>GitHub</ExternalLink>.
      </Callout>
    </Section>
  ),

};
