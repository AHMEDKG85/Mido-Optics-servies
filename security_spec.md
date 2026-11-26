# Mido Optics Security Specification (Phase 0)

## 1. Data Invariants

1. **Owner Isolation (`/customers/{customerId}`)**: Every customer document MUST belong to an authenticated, email-verified user (`ownerId == request.auth.uid`). No user can read, list, create, update, or delete another user's customers.
2. **PII Isolation (`/track/{trackId}`)**: Public order tracking documents MUST NOT contain PII (`phone`, `email`, `address`). Direct single-document `get` is permitted only for valid unguessable tokens (`trackId.size() >= 8`), while `list` is strictly `false` to prevent scraping or enumeration.
3. **Referential & Atomic Integrity (`/track/{trackId}`)**: A `track` document cannot be created without a corresponding `customers/{customerId}` document belonging to the same `ownerId` (`existsAfter` / `getAfter` check).
4. **Immutable Ownership & Creation Timestamps**: `ownerId`, `id`, `customerId`, `tok`, and `createdAt` cannot be modified after document creation. `createdAt == request.time` on create and `updatedAt == request.time` on both create and update.
5. **Bounded Types & Sizes**: Every string, number, and list field is strictly typed and length-bounded to prevent Denial-of-Wallet or oversized payload injection. No shadow/extra fields are allowed (`keys().hasOnly(...)`).
6. **Valid Path IDs**: All document IDs (`customerId`, `trackId`, `userId`) must satisfy `isValidId()` (`^[a-zA-Z0-9_-]+$`, `<= 128` chars).

## 2. The "Dirty Dozen" Attack Payloads (Must All Return `PERMISSION_DENIED`)

1. **Unauthenticated Customer Read/Write**: Unauthenticated user tries `get` or `list` on `/customers` or `setDoc` on `/customers/cust_1`.
2. **Unverified Email Spoof**: Signed-in user with `email_verified: false` tries to create a customer in `/customers/cust_1`.
3. **Identity Spoofing on Create**: Verified User A tries to create `/customers/cust_2` with `ownerId: "user_B"`.
4. **Cross-Tenant Customer Read/List**: Verified User A queries `/customers` without `where('ownerId', '==', uid)` or attempts `get` on User B's `/customers/cust_b`.
5. **Shadow / Ghost Field Injection**: Verified User A tries to create or update `/customers/cust_1` with an extra undeclared field `isAdmin: true` or `discountOverride: 9999`.
6. **Path ID Poisoning**: Verified User A attempts to write `/customers/bad$id..1500chars...` exceeding 128 chars or containing invalid characters.
7. **Immutable Field Tampering**: Verified User A tries to update `ownerId`, `createdAt`, or `tok` on an existing `/customers/cust_1`.
8. **Forged Client Timestamp**: Verified User A sends `createdAt: Timestamp.fromMillis(1000)` instead of `serverTimestamp()` (`request.time`).
9. **Public Track Enumeration (`list` scraping)**: Unauthenticated or authenticated user calls `getDocs(collection(db, 'track'))` to enumerate all orders.
10. **PII Leak on Public Track**: Verified User A tries to inject `phone: "01012345678"` or `email: "a@b.com"` into `/track/tok123456`.
11. **Orphaned Track Creation**: Verified User A creates `/track/tok_orphan` referencing a non-existent `customerId: "nonexistent"` or another owner's customer.
12. **Out-of-Bounds / Type Poisoning**: Verified User A sends `status: 99`, `total: -500`, `name: ""`, or `r: ["1", "2"]` (wrong tuple size) or 2MB `photo` string.
