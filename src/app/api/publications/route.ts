import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('publications')
    .select('id,name,slug,is_active')
    .eq('owner_id', user.id)
    .order('is_active', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const publications = (data || []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    slug: p.slug as string,
  }))

  return NextResponse.json({ publications })
}
