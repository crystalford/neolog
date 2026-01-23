import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateApiKey, recordApiUsage, checkRateLimit } from '@/lib/api/keys'

export const dynamic = 'force-dynamic'

/**
 * Upload an image
 * POST /api/v1/images
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Missing or invalid Authorization header' } },
                { status: 401 }
            )
        }

        const apiKey = authHeader.substring(7)
        const validation = await validateApiKey(apiKey)

        if (!validation) {
            return NextResponse.json(
                { error: { code: 'INVALID_API_KEY', message: 'Invalid or revoked API key' } },
                { status: 401 }
            )
        }

        const { userId, keyId } = validation

        // Check rate limit
        const withinLimit = await checkRateLimit(keyId, 100)
        if (!withinLimit) {
            await recordApiUsage(keyId, '/api/v1/images', 'POST', 429)
            return NextResponse.json(
                { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Rate limit exceeded' } },
                { status: 429 }
            )
        }

        // Parse multipart form data
        const formData = await request.formData()
        const file = formData.get('image') as File

        if (!file) {
            await recordApiUsage(keyId, '/api/v1/images', 'POST', 400)
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Image file is required' } },
                { status: 400 }
            )
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        if (!allowedTypes.includes(file.type)) {
            await recordApiUsage(keyId, '/api/v1/images', 'POST', 400)
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' } },
                { status: 400 }
            )
        }

        // Validate file size (max 10MB)
        const maxSize = 10 * 1024 * 1024 // 10MB
        if (file.size > maxSize) {
            await recordApiUsage(keyId, '/api/v1/images', 'POST', 400)
            return NextResponse.json(
                { error: { code: 'VALIDATION_ERROR', message: 'File too large. Maximum size: 10MB' } },
                { status: 400 }
            )
        }

        // Upload to Supabase storage
        const supabase = createClient()
        const fileExt = file.name.split('.').pop()
        const fileName = `${userId}/${Date.now()}.${fileExt}`

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(fileName, file)

        if (uploadError) {
            console.error('Upload error:', uploadError)
            await recordApiUsage(keyId, '/api/v1/images', 'POST', 500)
            return NextResponse.json(
                { error: { code: 'SERVER_ERROR', message: 'Failed to upload image' } },
                { status: 500 }
            )
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('images')
            .getPublicUrl(fileName)

        await recordApiUsage(keyId, '/api/v1/images', 'POST', 201)

        return NextResponse.json({
            url: publicUrl,
            filename: file.name,
            size: file.size,
            type: file.type,
        }, { status: 201 })

    } catch (error) {
        console.error('API error:', error)
        return NextResponse.json(
            { error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' } },
            { status: 500 }
        )
    }
}
