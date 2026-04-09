/**
 * POST /api/users/update-role
 * Update a user's role within a property or organization and synchronize resolver stats.
 * Handles cross-level transitions: property-level (property_admin, staff, mst, security, tenant)
 * to/from org-level (org_super_admin), with automatic membership activation/deactivation.
 * Resolver sync: MST/Staff roles get resolver_stats and mst_skills entries;
 * removing resolver role deletes both.
 * Body: { userId, newRole, propertyId?, organizationId?, skills? }
 * Auth: Supabase session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/frontend/utils/supabase/server'
import { createAdminClient } from '@/frontend/utils/supabase/admin'

interface UpdateRoleRequest {
    userId: string
    newRole: string
    propertyId?: string
    organizationId?: string
    skills?: string[]
    oldRole?: string
    promoteToOrg?: boolean // true when changing from property-level to org-level role
}
export async function POST(request: NextRequest) {
    try {
        const body: UpdateRoleRequest = await request.json()
        const { userId, newRole, propertyId, organizationId, skills = [] } = body

        if (!userId || !newRole) {
            return NextResponse.json(
                { error: 'Missing required fields: userId, newRole' },
                { status: 400 }
            )
        }

        // Get the current user's session to verify permissions
        const supabase = await createClient()
        const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser()

        if (authError || !currentUser) {
            return NextResponse.json(
                { error: 'Unauthorized. Please log in.' },
                { status: 401 }
            )
        }

        // Use admin client for updates
        const adminClient = createAdminClient()

        // Org-level roles that belong in organization_memberships
        const ORG_LEVEL_ROLES = ['org_super_admin'];
        // Property-level roles that belong in property_memberships
        const PROPERTY_LEVEL_ROLES = ['property_admin', 'staff', 'mst', 'security', 'tenant'];

        const isNewRoleOrgLevel = ORG_LEVEL_ROLES.includes(newRole);

        // 1. Get old role to detect transitions - check both tables, only ACTIVE memberships
        let oldRole = '';
        let oldRoleSource: 'property' | 'org' | '' = '';

        // Check active property membership
        if (propertyId) {
            const { data } = await adminClient
                .from('property_memberships')
                .select('role, is_active')
                .eq('user_id', userId)
                .eq('property_id', propertyId)
                .eq('is_active', true)
                .maybeSingle();
            if (data?.role) {
                oldRole = data.role;
                oldRoleSource = 'property';
            }
        }

        // Check active org membership
        if (organizationId) {
            const { data } = await adminClient
                .from('organization_memberships')
                .select('role, is_active')
                .eq('user_id', userId)
                .eq('organization_id', organizationId)
                .eq('is_active', true)
                .maybeSingle();
            if (data?.role) {
                // Active org membership takes priority
                oldRole = data.role;
                oldRoleSource = 'org';
            }
        }

        // If no active membership found, check inactive ones as fallback
        if (!oldRoleSource) {
            if (organizationId) {
                const { data } = await adminClient
                    .from('organization_memberships')
                    .select('role')
                    .eq('user_id', userId)
                    .eq('organization_id', organizationId)
                    .maybeSingle();
                if (data?.role) {
                    oldRole = data.role;
                    oldRoleSource = 'org';
                }
            }
            if (!oldRoleSource && propertyId) {
                const { data } = await adminClient
                    .from('property_memberships')
                    .select('role')
                    .eq('user_id', userId)
                    .eq('property_id', propertyId)
                    .maybeSingle();
                if (data?.role) {
                    oldRole = data.role;
                    oldRoleSource = 'property';
                }
            }
        }

        console.log(`Role change request: user=${userId}, oldRole=${oldRole}, oldRoleSource=${oldRoleSource}, newRole=${newRole}, propertyId=${propertyId}, orgId=${organizationId}`);

        // 2. Detect cross-level promotion: property-level → org-level
        const isPromotionToOrg = isNewRoleOrgLevel && oldRoleSource === 'property' && organizationId;
        // Detect demotion: org-level → property-level (propertyId may or may not be provided)
        const isDemotionToProperty = PROPERTY_LEVEL_ROLES.includes(newRole) && oldRoleSource === 'org' && organizationId;

        // 3. Perform the role update
        if (isPromotionToOrg) {
            // CROSS-LEVEL PROMOTION: property_admin → org_super_admin

            // Step A: Check if org membership already exists (could be inactive from previous demotion)
            const { data: existingOrgMembership } = await adminClient
                .from('organization_memberships')
                .select('user_id')
                .eq('user_id', userId)
                .eq('organization_id', organizationId)
                .maybeSingle();

            if (existingOrgMembership) {
                // Update existing row
                const { error: orgUpdateError } = await adminClient
                    .from('organization_memberships')
                    .update({ role: newRole, is_active: true })
                    .eq('user_id', userId)
                    .eq('organization_id', organizationId);
                if (orgUpdateError) throw orgUpdateError;
            } else {
                // Insert new row
                const { error: orgInsertError } = await adminClient
                    .from('organization_memberships')
                    .insert({
                        user_id: userId,
                        organization_id: organizationId,
                        role: newRole,
                        is_active: true,
                    });
                if (orgInsertError) throw orgInsertError;
            }

            // Step B: Deactivate all property_memberships for this user in this org
            const { data: orgProperties } = await adminClient
                .from('properties')
                .select('id')
                .eq('organization_id', organizationId);

            if (orgProperties && orgProperties.length > 0) {
                const propIds = orgProperties.map(p => p.id);
                const { error: deactivateError } = await adminClient
                    .from('property_memberships')
                    .update({ is_active: false })
                    .eq('user_id', userId)
                    .in('property_id', propIds);

                if (deactivateError) {
                    console.error('Failed to deactivate property memberships:', deactivateError);
                }
            }

            console.log(`User ${userId} promoted from property-level (${oldRole}) to org-level (${newRole})`);

        } else if (isDemotionToProperty) {
            // CROSS-LEVEL DEMOTION: org_super_admin → property-level role

            // Determine target property: use provided propertyId, or find existing inactive membership, or use first org property
            let targetPropertyId = propertyId;

            if (!targetPropertyId) {
                // Try to find an existing (deactivated) property membership for this user in this org
                const { data: existingPropMemberships } = await adminClient
                    .from('property_memberships')
                    .select('property_id')
                    .eq('user_id', userId)
                    .eq('is_active', false);

                if (existingPropMemberships && existingPropMemberships.length > 0) {
                    targetPropertyId = existingPropMemberships[0].property_id;
                } else {
                    // Fallback: use first property in this org
                    const { data: firstProp } = await adminClient
                        .from('properties')
                        .select('id')
                        .eq('organization_id', organizationId)
                        .limit(1)
                        .maybeSingle();

                    targetPropertyId = firstProp?.id;
                }
            }

            if (!targetPropertyId) {
                throw new Error('No property found in this organization to assign the user to.');
            }

            // Step A: Check if property membership exists (could be inactive from previous promotion)
            const { data: existingPropMembership } = await adminClient
                .from('property_memberships')
                .select('user_id')
                .eq('user_id', userId)
                .eq('property_id', targetPropertyId)
                .maybeSingle();

            if (existingPropMembership) {
                // Update existing row — set role and reactivate
                const { error: propUpdateError } = await adminClient
                    .from('property_memberships')
                    .update({ role: newRole, is_active: true })
                    .eq('user_id', userId)
                    .eq('property_id', targetPropertyId);
                if (propUpdateError) throw propUpdateError;
            } else {
                // Insert new row
                const { error: propInsertError } = await adminClient
                    .from('property_memberships')
                    .insert({
                        user_id: userId,
                        property_id: targetPropertyId,
                        role: newRole,
                        is_active: true,
                    });
                if (propInsertError) throw propInsertError;
            }

            // Step B: Deactivate org membership (set is_active = false, don't delete)
            const { error: orgDeactivateError } = await adminClient
                .from('organization_memberships')
                .update({ is_active: false })
                .eq('user_id', userId)
                .eq('organization_id', organizationId);

            if (orgDeactivateError) {
                console.error('Failed to deactivate org membership:', orgDeactivateError);
                throw orgDeactivateError;
            }

            console.log(`User ${userId} demoted from org-level (${oldRole}) to property-level (${newRole}) at property ${targetPropertyId}`);

        } else if (propertyId) {
            // Same-level property role change (e.g., staff → mst)
            const { error: propUpdateError } = await adminClient
                .from('property_memberships')
                .update({ role: newRole })
                .eq('user_id', userId)
                .eq('property_id', propertyId);

            if (propUpdateError) throw propUpdateError;
        } else if (organizationId) {
            // Same-level org role change
            const { error: orgUpdateError } = await adminClient
                .from('organization_memberships')
                .update({ role: newRole })
                .eq('user_id', userId)
                .eq('organization_id', organizationId);

            if (orgUpdateError) throw orgUpdateError;
        }

        const RESOLVER_ROLES = ['mst', 'staff'];
        const isNewResolver = RESOLVER_ROLES.includes(newRole);
        const isOldResolver = RESOLVER_ROLES.includes(oldRole);

        // 3. Synchronize resolver_stats and mst_skills
        if (isOldResolver && !isNewResolver) {
            // Role changed from resolver to non-resolver -> Remove entries
            console.log(`User ${userId} changed role from ${oldRole} to ${newRole}. Removing resolver stats.`);

            if (propertyId) {
                await adminClient.from('resolver_stats').delete().eq('user_id', userId).eq('property_id', propertyId);
            } else {
                // If org level, remove from all properties (safe bet)
                await adminClient.from('resolver_stats').delete().eq('user_id', userId);
            }

            // Remove general skill mapping
            await adminClient.from('mst_skills').delete().eq('user_id', userId);

        } else if (isNewResolver) {
            // Role is now a resolver -> Add or Update skills/stats
            console.log(`Synchronizing resolver skills for user ${userId} with role ${newRole}. Skills: ${skills.join(', ')}`);

            // Clear existing skills to overwrite
            await adminClient.from('mst_skills').delete().eq('user_id', userId);

            if (skills.length > 0) {
                // Insert new skill mapping
                const skillsToInsert = skills.map(code => ({
                    user_id: userId,
                    skill_code: code
                }));
                await adminClient.from('mst_skills').insert(skillsToInsert);

                // Sync resolver_stats for specific property
                if (propertyId) {
                    // Strict Filter based on User Request:
                    // MST -> technical, plumbing, vendor
                    // Staff -> soft_services
                    const VALID_MST_SKILLS = ['technical', 'plumbing', 'vendor'];
                    const VALID_STAFF_SKILLS = ['soft_services'];

                    const skillsForResolverPool = newRole === 'mst'
                        ? skills.filter(s => VALID_MST_SKILLS.includes(s))
                        : (newRole === 'staff' ? skills.filter(s => VALID_STAFF_SKILLS.includes(s)) : []);

                    // Clear existing stats for this property
                    await adminClient.from('resolver_stats').delete().eq('user_id', userId).eq('property_id', propertyId);

                    if (skillsForResolverPool.length > 0) {
                        const { data: skillGroups } = await adminClient
                            .from('skill_groups')
                            .select('id, code')
                            .eq('is_active', true)
                            .in('code', skillsForResolverPool);

                        if (skillGroups && skillGroups.length > 0) {
                            const statsToInsert = skillGroups.map(sg => ({
                                user_id: userId,
                                property_id: propertyId,
                                skill_group_id: sg.id,
                                current_floor: 1,
                                avg_resolution_minutes: 60,
                                total_resolved: 0,
                                is_available: true
                            }));
                            const { error: statsError } = await adminClient.from('resolver_stats').insert(statsToInsert);
                            if (statsError) console.error('Failed to insert resolver stats:', statsError);
                        }
                    } else {
                        console.log(`User ${userId} (Role: ${newRole}) does not have any resolver-eligible skills. Entry in resolver_stats removed/not created.`);
                    }
                }
            } else if (!isOldResolver) {
                // Moved from non-resolver to resolver role BUT NO SKILLS provided?
                // Usually we expect skills from the UI, but let's at least ensure they are in stats if it's new.
                // Actually, the user specifically asked for checkboxes, so we'll rely on those.
            }
        }

        return NextResponse.json({ success: true })
    } catch (error: any) {
        console.error('Update role API error:', error)
        return NextResponse.json(
            { error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
