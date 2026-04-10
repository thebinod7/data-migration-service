export const MIGRATION_TABLE = {
  WORDPRESS: {
    USERS: "76a_users",
    WP_POSTS: "76a_posts",
    POSTMETA: "76a_postmeta",
    AFFILIATES: '76a_affiliate_wp_affiliates'
  },
  LARAVEL: {
    IMPACT_PAGES: "impact_pages",
    PERSONAL_IMPACT_PAGES: "personal_impact_pages",
    CAMPAIGN_RECIPIENTS: "campaign_recipients",
    CAMPAIGN_RECIPIENT_METAS: "campaign_recipient_metas",
    CAMPAIGNS: "campaigns",
    CAMPAIGN_TYPES: 'campaign_types',
    IMPACT_TRIAL_DATES: "impact_trial_dates",
    IMAGE_TEMPLATES: "image_templates",
  },
  TRIBE: {
    INVITES: "tbl_invites",
    TRIBES: "tbl_tribes",
  },
  AUTH: {
    USERS: "tbl_users",
  },
};
