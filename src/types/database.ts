// Database types for Neolog
// These match the schema in supabase-schema.sql

export type Profile = {
  id: string
  username: string
  display_name: string | null
  bio: string | null
  avatar_url: string | null
  website_url: string | null
  twitter_url: string | null
  github_url: string | null
  linkedin_url: string | null
  created_at: string
  updated_at: string
}

export type Post = {
  id: string
  author_id: string
  
  // Forking
  forked_from_id: string | null
  root_post_id: string | null
  fork_depth: number
  allow_forks: boolean
  fork_count: number
  
  // Content
  title: string
  slug: string
  subtitle: string | null
  content: string | null
  content_html: string | null
  content_type: 'html' | 'markdown' | 'rich'
  
  // Metadata
  cover_image_url: string | null
  excerpt: string | null
  reading_time_minutes: number | null
  
  // Status
  status: 'draft' | 'published' | 'archived'
  published_at: string | null
  created_at: string
  updated_at: string
}

export type PostWithAuthor = Post & {
  author: Profile
}

export type PostWithForkInfo = PostWithAuthor & {
  forked_from?: {
    id: string
    title: string
    author: Profile
  } | null
}

export type PostVersion = {
  id: string
  post_id: string
  version_number: number
  title: string
  content: string | null
  content_html: string | null
  change_summary: string | null
  changed_by: string | null
  created_at: string
}

export type PostVersionWithAuthor = PostVersion & {
  changed_by_profile?: Profile | null
}

export type PostCollaborator = {
  id: string
  post_id: string
  user_id: string
  role: 'owner' | 'editor' | 'viewer'
  display_in_byline: boolean
  contribution_note: string | null
  added_at: string
  added_by: string | null
}

export type PostCollaboratorWithProfile = PostCollaborator & {
  user: Profile
}

export type Tag = {
  id: string
  name: string
  slug: string
  created_at: string
}

export type Draft = {
  id: string
  post_id: string | null
  author_id: string
  title: string | null
  content: string | null
  content_type: 'html' | 'markdown' | 'rich'
  saved_at: string
}

// Fork tree node (from get_fork_tree function)
export type ForkTreeNode = {
  id: string
  title: string
  author_username: string
  author_display_name: string | null
  fork_depth: number
  forked_from_id: string | null
  published_at: string | null
  fork_count: number
}

// Input types for creating/updating
export type CreatePostInput = {
  title: string
  slug?: string
  subtitle?: string
  content?: string
  content_html?: string
  content_type?: 'html' | 'markdown' | 'rich'
  cover_image_url?: string
  excerpt?: string
  status?: 'draft' | 'published'
  allow_forks?: boolean
}

export type ForkPostInput = {
  original_post_id: string
  title?: string // Optional: default to "Fork of {original title}"
}

export type UpdatePostInput = Partial<CreatePostInput>

export type CreateVersionInput = {
  post_id: string
  change_summary?: string
}

export type AddCollaboratorInput = {
  post_id: string
  user_id: string
  role?: 'editor' | 'viewer'
  display_in_byline?: boolean
  contribution_note?: string
}

export type CreateProfileInput = {
  username: string
  display_name?: string
  bio?: string
  avatar_url?: string
  website_url?: string
  twitter_url?: string
  github_url?: string
  linkedin_url?: string
}

export type UpdateProfileInput = Partial<CreateProfileInput>

// =============================================
// ANALYTICS TYPES
// =============================================

export type PostView = {
  id: string
  post_id: string
  viewer_id: string | null
  session_id: string
  time_on_page: number
  scroll_depth: number
  read_complete: boolean
  highlighted: boolean
  shared: boolean
  forked: boolean
  referrer: string | null
  referrer_domain: string | null
  device_type: 'desktop' | 'mobile' | 'tablet' | null
  started_at: string
  ended_at: string | null
}

export type ReadingProgress = {
  id: string
  view_id: string
  scroll_position: number
  time_elapsed: number
  created_at: string
}

export type PostStats = {
  post_id: string
  total_views: number
  unique_viewers: number
  avg_time_on_page: number
  avg_scroll_depth: number
  completion_rate: number
  views_from_feed: number
  views_from_profile: number
  views_from_search: number
  views_from_external: number
  views_from_fork: number
  views_desktop: number
  views_mobile: number
  views_tablet: number
  daily_views: DailyViewData[]
  updated_at: string
}

export type DailyViewData = {
  date: string
  views: number
  uniques: number
}

export type CuratorScore = {
  user_id: string
  score: number
  early_upvotes: number
  quality_ratio: number
  consistency_score: number
  expertise_domains: ExpertiseDomain[]
  updated_at: string
}

export type ExpertiseDomain = {
  domain: string
  score: number
  post_count: number
}

export type PostUpvote = {
  id: string
  post_id: string
  user_id: string
  created_at: string
  post_views_at_upvote: number
}

export type DropoffPoint = {
  scroll_bucket: number
  drop_count: number
  percentage: number
}

// Aggregated analytics for dashboard
export type CreatorAnalytics = {
  totalViews: number
  totalUniqueReaders: number
  avgReadTime: number
  avgScrollDepth: number
  avgCompletionRate: number
  topPosts: PostWithStats[]
  recentActivity: DailyViewData[]
  topReferrers: ReferrerData[]
  deviceBreakdown: DeviceBreakdown
}

export type PostWithStats = Post & {
  stats: PostStats
}

export type ReferrerData = {
  domain: string
  views: number
  percentage: number
}

export type DeviceBreakdown = {
  desktop: number
  mobile: number
  tablet: number
}

// =============================================
// BOOST MARKETPLACE TYPES
// =============================================

export type BoostCampaign = {
  id: string
  advertiser_id: string
  post_id: string
  name: string
  objective: 'subscribers' | 'reads' | 'clicks'
  daily_budget_cents: number
  total_budget_cents: number
  spent_cents: number
  bid_per_action_cents: number
  target_topics: string[] | null
  status: 'draft' | 'active' | 'paused' | 'completed' | 'exhausted'
  impressions: number
  clicks: number
  conversions: number
  created_at: string
  updated_at: string
}

export type BoostPlacement = {
  id: string
  publisher_id: string
  placement_type: 'feed_slot' | 'end_of_post' | 'newsletter' | 'recommended'
  is_active: boolean
  min_bid_cents: number
  revenue_share_percent: number
  blocked_topics: string[] | null
  blocked_advertisers: string[] | null
  created_at: string
}

export type BoostImpression = {
  id: string
  campaign_id: string
  placement_id: string | null
  viewer_id: string | null
  session_id: string | null
  shown_at: string
  clicked: boolean
  clicked_at: string | null
  converted: boolean
  converted_at: string | null
  cost_cents: number
  publisher_earnings_cents: number
}

export type BoostWallet = {
  user_id: string
  balance_cents: number
  pending_cents: number
  earned_cents: number
  updated_at: string
}

export type BoostTransaction = {
  id: string
  user_id: string
  type: 'deposit' | 'campaign_spend' | 'placement_earn' | 'withdrawal' | 'refund'
  amount_cents: number
  campaign_id: string | null
  impression_id: string | null
  description: string | null
  created_at: string
}

// =============================================
// REFERRAL TYPES
// =============================================

export type ReferralProgram = {
  id: string
  creator_id: string
  bounty_cents: number
  monthly_budget_cents: number | null
  spent_this_month_cents: number
  target_minimum_curator_score: number
  is_active: boolean
  created_at: string
}

export type ReferralLink = {
  id: string
  referrer_id: string
  program_id: string
  code: string
  clicks: number
  signups: number
  created_at: string
}

export type ReferralConversion = {
  id: string
  link_id: string
  subscriber_id: string | null
  bounty_cents: number
  paid: boolean
  paid_at: string | null
  created_at: string
}

// =============================================
// SUBSCRIPTION TYPES
// =============================================

export type Subscription = {
  id: string
  subscriber_id: string
  creator_id: string
  tier: 'free' | 'paid' | 'founding'
  stripe_subscription_id: string | null
  price_cents: number | null
  email_new_posts: boolean
  email_weekly_digest: boolean
  referral_link_id: string | null
  created_at: string
  updated_at: string
}

export type EmailSubscriber = {
  id: string
  creator_id: string
  email: string
  name: string | null
  status: 'pending' | 'active' | 'unsubscribed' | 'bounced' | 'complained'
  email_new_posts: boolean
  email_weekly_digest: boolean
  confirmed: boolean
  confirmation_token: string | null
  confirmed_at: string | null
  unsubscribe_token: string
  unsubscribed_at: string | null
  source: string | null
  created_at: string
}

export type FeedPost = {
  post_id: string
  title: string
  slug: string
  subtitle: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string
  reading_time_minutes: number | null
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}
