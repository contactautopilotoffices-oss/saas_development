/**
 * Database-driven Ticket Classification Engine
 * 
 * This module provides classification from database instead of hardcoded JSON.
 * Falls back to the original JSON dictionary if DB is unavailable.
 */

import { createClient } from '@/frontend/utils/supabase/client';
import dictionary from './issueDictionary.json';

export type SkillGroup = 'technical' | 'plumbing' | 'vendor' | 'soft_services';
export type Confidence = 'high' | 'low';

export interface ClassificationResult {
    issue_code: string | null;
    skill_group: SkillGroup;
    confidence: Confidence;
}

interface CachedConfig {
    data: CategoryConfig[];
    timestamp: number;
}

interface CategoryConfig {
    code: string;
    skill_group_code: string;
    keywords: string[];
}

// Cache with 30-second TTL
let configCache: CachedConfig | null = null;
const CACHE_TTL = 30000; // 30 seconds

/**
 * Fetch configuration from database with caching
 */
async function fetchConfigFromDB(): Promise<CategoryConfig[] | null> {
    // Check cache first
    if (configCache && (Date.now() - configCache.timestamp) < CACHE_TTL) {
        return configCache.data;
    }

    try {
        const supabase = createClient();

        const { data: categories, error } = await supabase
            .from('issue_categories')
            .select(`
                code,
                skill_group:skill_groups(code),
                issue_keywords(keyword)
            `)
            .eq('is_active', true);

        if (error || !categories || categories.length === 0) {
            console.log('DB config not available, using JSON fallback');
            return null;
        }

        const config: CategoryConfig[] = categories.map((cat: any) => ({
            code: cat.code,
            skill_group_code: cat.skill_group?.code || 'technical',
            keywords: cat.issue_keywords?.map((k: any) => k.keyword) || []
        }));

        // Update cache
        configCache = {
            data: config,
            timestamp: Date.now()
        };

        return config;
    } catch (error) {
        console.error('Error fetching config from DB:', error);
        return null;
    }
}

/**
 * Classify ticket using database configuration
 */
export async function classifyTicketFromDB(text: string): Promise<ClassificationResult> {
    const config = await fetchConfigFromDB();

    if (!config || config.length === 0) {
        // Fallback to original JSON-based classification
        const { classifyTicket } = await import('./classifyTicket');
        return classifyTicket(text);
    }

    const lowerText = text.toLowerCase();

    interface Match {
        issue_code: string;
        skill_group: SkillGroup;
        keyword_length: number;
    }

    const matches: Match[] = [];

    // Match against DB config
    for (const category of config) {
        for (const keyword of category.keywords) {
            if (lowerText.includes(keyword.toLowerCase())) {
                matches.push({
                    issue_code: category.code,
                    skill_group: category.skill_group_code as SkillGroup,
                    keyword_length: keyword.length
                });
            }
        }
    }

    if (matches.length === 0) {
        return {
            issue_code: null,
            skill_group: 'technical',
            confidence: 'low'
        };
    }

    // Group by skill group and apply precedence
    const precedence: SkillGroup[] = ['vendor', 'technical', 'plumbing', 'soft_services'];

    for (const skillGroup of precedence) {
        const groupMatches = matches.filter(m => m.skill_group === skillGroup);

        if (groupMatches.length > 0) {
            // Count issue codes and pick the one with most matches
            const counts: Record<string, number> = {};
            groupMatches.forEach(m => {
                counts[m.issue_code] = (counts[m.issue_code] || 0) + 1;
            });

            let bestIssueCode = groupMatches[0].issue_code;
            let maxCount = 0;

            for (const [code, count] of Object.entries(counts)) {
                if (count > maxCount) {
                    maxCount = count;
                    bestIssueCode = code;
                } else if (count === maxCount) {
                    // Tie-breaker: longest keyword
                    const currentMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === code).map(m => m.keyword_length));
                    const bestMaxLen = Math.max(...groupMatches.filter(m => m.issue_code === bestIssueCode).map(m => m.keyword_length));
                    if (currentMaxLen > bestMaxLen) {
                        bestIssueCode = code;
                    }
                }
            }

            return {
                issue_code: bestIssueCode,
                skill_group: skillGroup,
                confidence: 'high'
            };
        }
    }

    return {
        issue_code: null,
        skill_group: 'technical',
        confidence: 'low'
    };
}

/**
 * Invalidate the config cache (call after updates to issue_categories or issue_keywords)
 */
export function invalidateConfigCache(): void {
    configCache = null;
}

export default classifyTicketFromDB;
