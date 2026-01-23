import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function createMissingPublications() {
    console.log('🔍 Finding users without publications...')

    // Get all profiles
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, display_name, bio')

    if (profileError) {
        console.error('❌ Error fetching profiles:', profileError)
        return
    }

    console.log(`📊 Found ${profiles.length} total profiles`)

    let created = 0
    let skipped = 0

    for (const profile of profiles) {
        // Check if user has a publication
        const { data: existingPubs } = await supabase
            .from('publications')
            .select('id')
            .eq('owner_id', profile.id)
            .limit(1)

        if (existingPubs && existingPubs.length > 0) {
            skipped++
            continue
        }

        // Create publication for this user
        const username = profile.username || `user_${profile.id.slice(0, 8)}`
        const displayName = profile.display_name || username

        const { error: insertError } = await supabase
            .from('publications')
            .insert({
                owner_id: profile.id,
                name: displayName,
                slug: username.toLowerCase().replace(/[^a-z0-9_]/g, ''),
                description: profile.bio || null,
            })

        if (insertError) {
            console.error(`❌ Error creating publication for ${username}:`, insertError)
        } else {
            console.log(`✅ Created publication for ${username}`)
            created++
        }
    }

    console.log(`\n✨ Done!`)
    console.log(`   Created: ${created}`)
    console.log(`   Skipped: ${skipped}`)
}

createMissingPublications()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Fatal error:', err)
        process.exit(1)
    })
