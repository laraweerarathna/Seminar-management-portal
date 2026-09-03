# Firebase security and user access

The portal uses a role and an explicit access flag. Any user with a verified
Google account can sign in and immediately receives read-only viewer access. A
new profile is created as:

```text
role: viewer
approved: true
```

The existing field name `approved` is retained for compatibility, but it now
means "access enabled." Administrators can set it to `false` to block a specific
account. A blocked account can only read its own profile document and cannot
read seminar, contact, school, report, or activity data.

## Roles

- `viewer`: can view portal data and use standard report exports.
- `editor`: can also create and update seminars, schools, contacts, and notes.
- `co_admin`: can also delete operational records and download full backups,
  but cannot view or manage user accounts.
- `admin`: has full access, including role changes, blocking/unblocking, and
  removing blocked accounts from the user list.

Use the admin-only **Admin control** tab to block or unblock an account, assign
its role, remove a blocked user, download a full backup, and review the access
audit. The active administrator cannot demote, block, or remove their own
account from this screen.

Removing a blocked user deletes the visible `users` profile and atomically adds
an immutable document under `removedUsers`. That marker prevents the same
Google account from recreating itself as a new Viewer on a later sign-in. This
does not delete the person's Google or Firebase Authentication account.

User access, removal, and role-change events are written to the separate
`adminActivities` collection. Firestore Rules prevent viewers and editors from
reading or writing that collection; Co-Admins are also excluded from every
user-management collection and the Admin control route.

## Publish the rules

The checked-in configuration targets the Firebase project
`seminar-coordination-portal`. Authenticate the Firebase CLI once and deploy the
active products' rule sets:

```sh
npx --yes firebase-tools@15.29.0 login
npm run deploy:security-rules
```

This publishes:

- `firestore.rules`: active-user and role-based Firestore access.
- `database.rules.json`: deny-all rules for the unused Realtime Database.

Cloud Storage is not currently initialized for this Firebase project, so there is
no bucket to deploy rules to. `storage.rules` contains deny-all rules ready to
publish before Storage is ever enabled.

If deploying only Firestore from the Firebase Console, copy the complete contents
of `firestore.rules` into **Firestore Database → Rules** and publish it. The
application automatically adds `approved: true` to legacy profiles that predate
the access flag.

## Verify changes locally

```sh
npm run test:rules
```

The emulator tests cover signed-out users, automatically active new viewers,
blocked and removed accounts, all four roles, self-unblocking and promotion
attempts, administrator self-lockout, and append-only activity history.
Security Rules protect the database itself; hiding buttons in the user interface
is only a usability measure.
