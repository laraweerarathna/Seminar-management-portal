# Enable secure multi-user access

1. In Firebase Console, open **Authentication → Sign-in method** and enable **Google**.
2. Open **Firestore Database → Rules**, replace the rules with the contents of `firestore.rules`, then publish.
3. Sign in once with the person who will administer the portal. A `users` document is created with the `viewer` role.
4. In Firestore, change that user's `role` field to `admin`. Admins can set other users to `editor` or leave them as `viewer`.

Roles:

- `viewer`: can view data and reports.
- `editor`: can create and update seminars, contacts, and school notes.
- `admin`: can also delete records and manage user roles.

These rules protect the database itself, rather than only hiding buttons in the interface.
