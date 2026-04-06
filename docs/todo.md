# Todos for migration:

- find isAdvisor role
- count total rows migrated on particular table
- map config on accountProfiles migration
- handle fallback for personal/business account empty
- ssoId map for users
- fix build sources for impactRecords migration
- impactRegion on impact records migration
- fix attemptNumber on calculatorResponse

==========Fields remaining by table===============

- Users => ssoUserId
- Account => isActiveAdvisor
- AccountMembership => ✅
- AccountProfile => logo = business ? logo : profilePic
- ProfileSection => config
- ImpactRecords => programId, templateId, source
- Trials => ✅
- CalculatorReponse => attemptNumber, scoreTotal, scoreBase, scoreByPage, sdgPersonal, sdgPlanet, referredBy, currentPage
- ReferralCodes => ✅
