# Nest research notes

Facts about Hack Club Nest that the design depends on. Checked on 2026-11-04 against the Nest guides (guides.hackclub.app), the [hackclub/nest](https://github.com/hackclub/nest) repository, and the dashboard itself. Items marked **unverified** still need confirmation from the Nest team (#nest on the Hack Club Slack).

## Accounts and access

- Nest is free Linux hosting for teenagers. Accounts need approval; the [Quickstart](https://guides.hackclub.app/index.php/Quickstart) covers signing up.
- Access is by SSH key only. Passwords aren't used.
- Users connect with `ssh <nest-username>@hackclub.app`. The address is the bastion, not the container.
- The dashboard has an SSH Keys page (`/dashboard/keys`). Users can add and remove public keys there. Accepted types are `ssh-ed25519` and `ssh-ecdsa`. Each account can hold up to 10 keys, and the last key can't be removed. Private keys are rejected.
- The public SSH API is not documented. The add and remove endpoints (`/ssh-keys/add`, `/ssh-keys/remove` in [routes/user.ts](https://github.com/hackclub/nest/blob/main/mocinno/backend/src/routes/user.ts)) sit behind the dashboard's login session, so they are not a token-based API.

## The bastion (SSH entry point)

Source: [mocinno/backend/src/bastion.ts](https://github.com/hackclub/nest/blob/main/mocinno/backend/src/bastion.ts).

- The bastion checks the connecting key against the user's stored `ssh_keys` on every connection. New keys work on the next connection without a restart.
- If the container is stopped, the bastion starts it. If it is suspended, the connection is refused with a message to contact an admin.
- The bastion connects to the container as `root` (`upstreamUser: 'root'`). A key that passes the bastion therefore has root on the container. Restricting the key to a non-root user is not possible at this layer.
- Proxmox host ports 22, 8006 and 111 are blocked from the internet ([SETUP.md](https://github.com/hackclub/nest/blob/main/SETUP.md)). The bastion is the only SSH entry point.

## Containers and resources

- Each user gets one LXC container with **2 vCPUs, 2 GB RAM and 16 GB disk** by default. More can be requested through the form linked from the [Limitations](https://guides.hackclub.app/index.php/Limitations) page.
- Limitations: no SMB, CIFS or NFS mounts; `/dev/net/tun` is disabled, so WireGuard doesn't work; there's no SLA.
- Docker: the [Docker guide](https://guides.hackclub.app/index.php/Docker) shows installing Docker inside the container and running `docker compose`. It doesn't mention rootless mode or port publishing. **Unverified:** whether rootless Docker works inside a container.
- The user has root on their own container, so a deploy user is not enforced by Nest. Any restriction has to be enforced by us.

## Networking and domains

- No public IPv4. HTTP(S) goes through a reverse proxy. Each container gets a public IPv6 address.
- A domain is added in the dashboard with a target port. Example from the dashboard: `poorup.jeremy-d.hackclub.app` → port 8080. The user points a custom domain at `<username>.hackclub.app`.
- Apps therefore listen on an unprivileged port (for example 8080) and the proxy forwards to it. Ports below 1024 aren't needed.
- **Unverified:** whether any API exists for adding domains. The dashboard form is the only documented route.

## Acceptable use

Source: [Acceptable Use Policy](https://guides.hackclub.app/index.php/Acceptable_Use_Policy).

- Prohibited: circumventing resource limits or quotas, including creating extra accounts to get around them.
- Prohibited: operating software or services that use Nest resources for money without permission. The policy names crypto mining, bandwidth resale and VPN or proxy services.
- Prohibited: unauthorized access to accounts or systems, and scanning servers or networks.
- Hosting: the policy says failing to comply with legitimate data requests is prohibited and applies especially to hosted services.
- Not covered by the policy: SSH key management, automated deployment, and services that deploy to users' accounts. The user reports that Cyteon, who is responsible for Nest, said yes to a third-party deploy service. **Get this in writing** before launch.

## Open questions

1. Can a non-root user run rootless Docker inside a Nest container? Is `uidmap` setup allowed?
2. Is there any API for SSH keys or domains? If not, the manual paste stays.
3. What is the per-user limit on requests for more resources, and how long do they take?
4. Does Nest want an independent deploy tool, and what happens if an app abuses resources?
