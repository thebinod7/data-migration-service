# Migration Document

### Prerequisite: Programs, Templates, Products (MANUAL — done before script runs)

### Migration Order

1. users
2. accounts
3. account profiles
4. impact records
5. trials
6. tribes
7. calculator
8. aggregates
9. files

### 1. User migration: Fetch users from `DB: Wordpress` and `table: users`

- ssoUserId: findUserByEmail [SSO Auth]
- email: `wp.user_email`
- firstName: `wp.first_name`
- lastName: `wp.last_name`
- wordpressUserId: `wp.ID`
- role: "user"
- activeAccountId: `account.id` [After creating account]
- personalAccountCreated: personal account created ? true : false
- signupSideEffectsCompleted: true
- onboardingCompleted: true
- createdAt: FormatDateToUnix(`wp_users.user_registered`)
- updatedAt: timestamp

\*\*\*[Ceate mapping of email => convexUserId AND wpUserId => convexUserId]

### 2. Account migration: fetch data from `DB: Laravel` and `table: impact_pages + personal_impact_pages`

`impact => getUserFromImpactPages() + p_impact =>getUserFromPersonalImpactPage()`

\*\*\* If NON exist, fetch campaigm_recepient record and:

- Determine from campaign types what account(s) they need
- If they have business-type impact → create a default business account
- If they have personal-type impact → create a default personal account
- If unclear → create a default personal account
- Name = user's firstName + " " + lastName
- Slug = generate from name (e.g., "john-doe" with uniqueness suffix)

- type: impact ? "business" : "personal"
- name: impact ? impact.company : p_impact.fName+lName
- slug: impact ? impact.slug : p_impact.slug
- ownerId: `convex.user.id`
- isDefault: true
- isActiveAdvisor: false [TBD]
- onboardingCompleted: true
- createdAt: impact ? impact.created_at : p_impact.created_at
- updatedAt: timestamp

### 3. AccountMembership migration: On each account creation

- accountId: `acc.id`
- userId: `user.id`
- role: "owner"
- createdAt: acc.createdAt

### 4. AccountProfile migration: On each account creation

- accountId: `acc.id`
- visibility: impact ? impact.page_status : p_impact.page_status === "LIVE" ?? "public" : "private"
- logoId: impact.logo [TDB]
- wordmarkId: undefined
- displayUnit: impact ? impacte.display_status: p_impact.display_status
- sectionOrder: [secionIDs]
- ctaUrl: p_impact ? '' : impact.ctaUrl
- inviteUrl: impact ? impact.invite_url : p_impact.invite_url
- createdAt: created_at
- updatedAt: timestamp

### 5. ProfileSection migration: On each account creation

- accountId: `acc.id`
- config: `{}` Pull records from impact and p_impact and populate JSON field
- createdAt: created_at
- udpatedAt: timestamp

### 6. ImpactRecords migration:

- impactId: Generate like; `ID-{year}-{random}`
- accountId: Follow rule on doc
- impactAmount
- impactRegion
- programId
- templateId
- source
- state
- attributionStatus
- certificateNameOverride
- orderId
- originalEmail
- purchaserEmail
- createdAt
