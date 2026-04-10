# Nice to have for migration:
- count total rows migrated on particular table





==========Fields remaining by table===============

- Users => ssoUserId ✅
- Account => isActiveAdvisor ✅
- AccountMembership => ✅
- AccountProfile => logo = business ? logo : profilePic
- ProfileSection => config
- ImpactRecords => source + find reason for skip
- Trials => ✅
- CalculatorReponse => attemptNumber, scoreTotal, scoreBase, scoreByPage, referredBy, currentPage
- ReferralCodes => ✅
- Tribe => ✅
- TribeMembership => ✅