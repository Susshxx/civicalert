# CivicAlert administrator setup

Create the main administrator in Firebase Console. Do not put the password in source code, `.env` files, or Firestore.

Passwords are managed by Firebase Authentication. The application sends the password only to Firebase during account creation or sign-in; Firebase hashes and stores it securely. Firestore stores no password and no password hash.

1. Open Firebase Console for project `incidentreportts`.
2. Open **Authentication > Users > Add user**.
3. Create the account with this email:

   `admin.gov@incidentreport.com`

4. Set the requested password directly in Firebase Console.
5. Copy the new user's Firebase Auth UID.
6. Open **Firestore Database > users** and create a document whose ID is that UID.
7. Add these fields:

```text
name: Main Administrator
email: admin.gov@incidentreport.com
role: System Administrator
categoryIds: []
```

Open the portal at:

`http://localhost:5173/incidentreports/admin`

The portal will allow this account to manage routing emails, create department accounts, and view all reports. Department users must have their own Firebase Auth account and a `users/{uid}` document with `role: Department Officer` and the relevant `categoryIds`.
