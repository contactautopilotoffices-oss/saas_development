export type UserRole = 'tenant' | 'mst' | 'admin' | 'master_admin';

// Department classification for MST ticket routing (legacy)
export type TicketDepartment = 'technical' | 'soft_services' | 'vendor';

// Skill group classification (new deterministic system)
export type SkillGroup = 'technical' | 'plumbing' | 'vendor' | 'soft_services';

// Updated ticket status flow for MST-driven workflow
// REQUESTED (open) -> WAITLIST -> ASSIGNED -> WORK_STARTED (in_progress) -> [PAUSED] -> PENDING_VALIDATION -> RESOLVED (approved) or OPEN (rejected)
export type TicketStatus =
    | 'open'                 // REQUESTED - Initial tenant submission
    | 'waitlist'             // WAITLIST - In department queue
    | 'assigned'             // ASSIGNED - MST self-assigned
    | 'in_progress'          // WORK_STARTED - MST actively working
    | 'paused'               // PAUSED - Explicitly paused with reason
    | 'pending_validation'   // AWAITING CLIENT APPROVAL - MST marked done, waiting tenant to validate
    | 'resolved'             // Tenant-approved completion
    | 'closed';              // Admin-closed

export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export type TicketCategory = 'electrical' | 'plumbing' | 'hvac' | 'cleaning' | 'security' | 'other';

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    specializations?: TicketCategory[]; // For MSTs
    activeTicketCount: number; // For assignment logic
    isAvailable: boolean;
    organizationId: string;
}

export interface Ticket {
    id: string;
    title: string;
    description: string;
    category: TicketCategory;
    priority: TicketPriority;
    status: TicketStatus;
    department: TicketDepartment;
    images?: string[]; // URLs to attachments

    // Relationships
    raisedBy: string; // User UID
    assignedTo?: string; // User UID (MST)
    organizationId: string; // Tenant isolation

    // Work pause state (separate from SLA pause)
    workPaused?: boolean;
    workPausedAt?: string;
    workPauseReason?: string;
    workPausedBy?: string;

    // Metadata
    createdAt: number;
    updatedAt: number;
    closedAt?: number;
    workStartedAt?: number;
    assignedAt?: number;
}

// MST-specific ticket view interface
export interface MstTicketView {
    id: string;
    ticket_number: string;
    title: string;
    description: string;
    department: TicketDepartment;
    status: TicketStatus;
    priority: string;
    category?: string;
    assigned_to?: string;
    assignee?: {
        id: string;
        full_name: string;
        email: string;
    };
    creator?: {
        id: string;
        full_name: string;
        email: string;
    };
    work_paused: boolean;
    work_pause_reason?: string;
    work_paused_at?: string;
    created_at: string;
    work_started_at?: string;
    assigned_at?: string;
    photo_before_url?: string;
    photo_after_url?: string;
    property_id: string;
    organization_id: string;
    internal?: boolean;
    ticket_escalation_logs?: { from_level: number; to_level: number | null; escalated_at: string; from_employee?: { full_name: string; user_photo_url?: string | null } | null; to_employee?: { full_name: string; user_photo_url?: string | null } | null }[];
}

// MST workload tracking
export interface MstLoad {
    userId: string;
    fullName: string;
    activeTicketCount: number;
    pausedTicketCount: number;
    completedThisWeek: number;
    isAvailable: boolean;
}

// Pause reason presets
export const PAUSE_REASON_PRESETS = [
    'Waiting for parts',
    'Need vendor support',
    'Pending approval',
    'Scheduled for later',
    'Break',
    'Other'
] as const;

export type PauseReasonPreset = typeof PAUSE_REASON_PRESETS[number];

// Snag Import Types
export interface SnagImportRow {
    issue_description: string;
    issue_date: string;
    // Computed by classification
    skill_group?: SkillGroup;
    issue_code?: string;
    confidence?: 'high' | 'low';
    // Validation
    isValid?: boolean;
    validationErrors?: string[];
}

export interface SnagImportBatch {
    id: string;
    property_id: string;
    organization_id: string;
    imported_by: string;
    filename: string;
    total_rows: number;
    valid_rows: number;
    error_rows: number;
    status: 'pending' | 'processing' | 'completed' | 'failed';
    created_at: string;
    completed_at?: string;
}
