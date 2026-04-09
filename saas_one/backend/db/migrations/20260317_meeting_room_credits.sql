-- ============================================================
-- Meeting Room Credit System
-- ============================================================

-- 1. Credits allocation per tenant per property
CREATE TABLE IF NOT EXISTS meeting_room_credits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,        -- tenant
    assigned_by UUID REFERENCES users(id),                               -- admin who assigned
    monthly_hours DECIMAL(6,2) NOT NULL DEFAULT 0,                      -- total hours granted per month
    remaining_hours DECIMAL(6,2) NOT NULL DEFAULT 0,                    -- hours left this cycle
    last_reset_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),                   -- when last monthly reset happened
    next_reset_at TIMESTAMPTZ NOT NULL DEFAULT (date_trunc('month', NOW()) + INTERVAL '1 month'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (property_id, user_id)
);

-- 2. Refill requests raised by tenants when credits run out
CREATE TABLE IF NOT EXISTS meeting_room_credit_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,        -- tenant requesting
    requested_hours DECIMAL(6,2) NOT NULL DEFAULT 0,                    -- 0 = just a refill request, admin decides amount
    reason TEXT,                                                          -- optional note from tenant
    status TEXT NOT NULL DEFAULT 'pending',                              -- pending | approved | rejected
    admin_note TEXT,                                                      -- admin's response note
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Audit log for all credit changes
CREATE TABLE IF NOT EXISTS meeting_room_credit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    credit_id UUID NOT NULL REFERENCES meeting_room_credits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),                          -- tenant whose credits changed
    action TEXT NOT NULL,  -- 'assigned' | 'deducted' | 'refunded' | 'monthly_reset' | 'manual_refill' | 'request_approved'
    hours_changed DECIMAL(6,2) NOT NULL,                                 -- positive = added, negative = deducted
    hours_after DECIMAL(6,2) NOT NULL,                                   -- remaining after change
    booking_id UUID REFERENCES meeting_room_bookings(id) ON DELETE SET NULL,
    request_id UUID REFERENCES meeting_room_credit_requests(id) ON DELETE SET NULL,
    performed_by UUID REFERENCES users(id),                              -- who triggered the change
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_mrcc_property_user ON meeting_room_credits(property_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mrcc_next_reset ON meeting_room_credits(next_reset_at);
CREATE INDEX IF NOT EXISTS idx_mrccr_property_status ON meeting_room_credit_requests(property_id, status);
CREATE INDEX IF NOT EXISTS idx_mrccr_user ON meeting_room_credit_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_mrccl_credit ON meeting_room_credit_log(credit_id);

-- RLS
ALTER TABLE meeting_room_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_room_credit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_room_credit_log ENABLE ROW LEVEL SECURITY;

-- Tenants can read their own credits
CREATE POLICY "tenant_read_own_credits" ON meeting_room_credits
    FOR SELECT USING (user_id = auth.uid());

-- Admins/staff can read all credits for their property
CREATE POLICY "admin_read_property_credits" ON meeting_room_credits
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM property_memberships
            WHERE property_id = meeting_room_credits.property_id
            AND user_id = auth.uid()
            AND role IN ('property_admin', 'staff', 'org_admin')
        )
    );

-- Tenants can read and insert their own requests
CREATE POLICY "tenant_manage_own_requests" ON meeting_room_credit_requests
    FOR ALL USING (user_id = auth.uid());

-- Admins can manage all requests for their property
CREATE POLICY "admin_manage_requests" ON meeting_room_credit_requests
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM property_memberships
            WHERE property_id = meeting_room_credit_requests.property_id
            AND user_id = auth.uid()
            AND role IN ('property_admin', 'staff', 'org_admin')
        )
    );

-- Credit log: tenant sees own, admin sees all
CREATE POLICY "read_credit_log" ON meeting_room_credit_log
    FOR SELECT USING (
        user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM meeting_room_credits mrc
            JOIN property_memberships pm ON pm.property_id = mrc.property_id
            WHERE mrc.id = meeting_room_credit_log.credit_id
            AND pm.user_id = auth.uid()
            AND pm.role IN ('property_admin', 'staff', 'org_admin')
        )
    );
