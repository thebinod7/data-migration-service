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

### 6. ImpactRecords migration: `DB: Laravel` and `table: campaign_recipients,campaign_recipient_metas, campaigns

`get details from each tables: Eg: campaign, campaign_meta, campgaign_rec`

- impactId: Generate like; `ID-{year}-{random}`
- accountId: Follow rule on doc
- impactAmount: `campaign_rec.impact_kg`
- impactRegion: `campaign.slug` OR from meta OR "PH" if Unknown
- programId: `campaign.campaign_type_id` Lookup in Pre-setup config
- templateId: `campaign.image_template_id` Lookup in Pre-setup Config
- source: `campaign_rec.source + subscription_type`
- state: `campaign_rec.status` => If failed, skip row
- attributionStatus: if user found by email ? `assigned` : `unclaimed`
- certificateNameOverride: `campaign_rec.name`
- orderId: `campaign.order_id`
- originalEmail: `campaign_rec.origin_email`
- purchaserEmail: `campaign_recipients.email`
- createdAt: `campaign_rec.created_at`

### 7. Trials: Only for business accounts

`get details from impact_trial_dates as itd`

- accountId: user's business account.id
- type: `itd.professional_impact_page`
- startDate: `itd.start_date`
- endDate: `itd.end_date`
- source: "signup" for default trials, or determine from context
- status: If endDate > now → "active", else → "expired"
- createdAt: From source data
- updatedAt: migration

### 8. CalculatorReponse: `DB: Wordpress and table: plastic_footprint`

Calculator responses were stored as WordPress posts of type plastic_footprint, with the data in post_content as JSON.

- userId: extract email from post and email=>convexUserId
- accountId: User's personal `account.id`
- attemptNumber: Count of calculator posts per user, ordered by date
- country: parsed from post content
- preferenceId: parsed from post content
- answers: parsed from post content, convert to `Record<string,string>`
- scoreTotal: `footprint_score` or computed from answer
- scoreBase: Parsed from JSON
- scoreByPage: Parsed from JSON
- demographics: Parsed from JSON
- newsletterOptIn: undefined
- sdgPersonal: Parsed from JSON
- sdgPlanet: Parsed from JSON
- referredBy: Parsed from JSON
- currentPage: "results" for completed, or last page from JSON
- status: "completed" if score exists, else "in_progress"
- completedAt: post_date if completed
- createdAt: post_date
- updatedAt: timestamp
