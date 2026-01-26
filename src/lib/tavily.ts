/**
 * Tavily API Client
 * Web search API optimized for AI agents
 */

export interface TavilySearchResult {
    title: string
    url: string
    content: string
    score: number
    published_date?: string
}

export interface TavilySearchResponse {
    results: TavilySearchResult[]
    query: string
    response_time: number
}

export interface TavilySearchOptions {
    search_depth?: 'basic' | 'advanced'
    max_results?: number
    include_domains?: string[]
    exclude_domains?: string[]
}

/**
 * Search the web using Tavily
 */
export async function searchWithTavily(
    query: string,
    apiKey: string,
    options: TavilySearchOptions = {}
): Promise<TavilySearchResponse> {
    const {
        search_depth = 'advanced',
        max_results = 5,
        include_domains = [],
        exclude_domains = [],
    } = options

    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            api_key: apiKey,
            query,
            search_depth,
            max_results,
            include_domains,
            exclude_domains,
            include_answer: false,
            include_raw_content: false, // We just want clean summaries
        }),
    })

    if (!response.ok) {
        const error = await response.text()
        throw new Error(`Tavily API error: ${response.status} - ${error}`)
    }

    const data = await response.json()

    return {
        results: data.results || [],
        query: data.query,
        response_time: data.response_time,
    }
}

/**
 * Format search results into a context string for LLMs
 */
export function formatSearchResults(results: TavilySearchResult[]): string {
    if (results.length === 0) {
        return 'No search results found.'
    }

    return results
        .map((result, index) => {
            const parts = [
                `[${index + 1}] ${result.title}`,
                `URL: ${result.url}`,
                `Content: ${result.content}`,
            ]

            if (result.published_date) {
                parts.push(`Published: ${result.published_date}`)
            }

            return parts.join('\n')
        })
        .join('\n\n---\n\n')
}
