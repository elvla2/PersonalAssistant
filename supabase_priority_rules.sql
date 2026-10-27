-- ==========================================================
-- Priority Rules Migration & Bilingual Seed
-- ==========================================================

CREATE TABLE IF NOT EXISTS public.priority_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL,
    language TEXT NOT NULL, -- 'en' | 'es'
    category TEXT NOT NULL, -- 'financial' | 'logistics' | 'deadline' | 'legal'
    priority TEXT NOT NULL DEFAULT 'P1_HIGH',
    channel TEXT NOT NULL DEFAULT 'all',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.priority_rules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'priority_rules' AND policyname = 'Anyone can view priority rules'
    ) THEN
        CREATE POLICY "Anyone can view priority rules" ON public.priority_rules
            FOR SELECT USING (true);
    END IF;
END $$;

-- Enable Realtime for priority_rules
ALTER PUBLICATION supabase_realtime ADD TABLE public.priority_rules;

-- Seed Bilingual P1 Keywords
INSERT INTO public.priority_rules (keyword, language, category, priority, channel) VALUES
    -- Financial (English)
    ('overdue', 'en', 'financial', 'P1_HIGH', 'all'),
    ('past due', 'en', 'financial', 'P1_HIGH', 'all'),
    ('outstanding invoices', 'en', 'financial', 'P1_HIGH', 'all'),
    ('settle the overdue', 'en', 'financial', 'P1_HIGH', 'all'),
    ('overdue account', 'en', 'financial', 'P1_HIGH', 'all'),
    ('payment today', 'en', 'financial', 'P1_HIGH', 'all'),
    ('process payment today', 'en', 'financial', 'P1_HIGH', 'all'),
    ('remit payment', 'en', 'financial', 'P1_HIGH', 'all'),
    ('balance overdue', 'en', 'financial', 'P1_HIGH', 'all'),
    ('final notice', 'en', 'financial', 'P1_HIGH', 'all'),
    ('collections', 'en', 'financial', 'P1_HIGH', 'all'),
    ('credit hold', 'en', 'financial', 'P1_HIGH', 'all'),
    ('credit line suspended', 'en', 'financial', 'P1_HIGH', 'all'),
    ('wire transfer today', 'en', 'financial', 'P1_HIGH', 'all'),
    ('immediate payment required', 'en', 'financial', 'P1_HIGH', 'all'),

    -- Financial (Spanish)
    ('vencido', 'es', 'financial', 'P1_HIGH', 'all'),
    ('facturas vencidas', 'es', 'financial', 'P1_HIGH', 'all'),
    ('saldo vencido', 'es', 'financial', 'P1_HIGH', 'all'),
    ('cuenta vencida', 'es', 'financial', 'P1_HIGH', 'all'),
    ('pago hoy', 'es', 'financial', 'P1_HIGH', 'all'),
    ('procesar pago hoy', 'es', 'financial', 'P1_HIGH', 'all'),
    ('aviso de cobro', 'es', 'financial', 'P1_HIGH', 'all'),
    ('último aviso', 'es', 'financial', 'P1_HIGH', 'all'),
    ('suspensión de crédito', 'es', 'financial', 'P1_HIGH', 'all'),
    ('bloqueo de cuenta', 'es', 'financial', 'P1_HIGH', 'all'),
    ('pago inmediato', 'es', 'financial', 'P1_HIGH', 'all'),
    ('transferir hoy', 'es', 'financial', 'P1_HIGH', 'all'),
    ('cuenta suspendida', 'es', 'financial', 'P1_HIGH', 'all'),
    ('cobranza urgente', 'es', 'financial', 'P1_HIGH', 'all'),

    -- Logistics & Customs (English)
    ('customs hold', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('cargo on hold', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('shipment on hold', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('held at customs', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('customs detention', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('demurrage', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('detention charges', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('customs exam', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('customs seizure', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('port congestion fee', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('vessel cutoff', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('gate cutoff', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('missed cutoff', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('rollover risk', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('damaged cargo', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('urgent release', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('telex release', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('stop delivery', 'en', 'logistics', 'P1_HIGH', 'all'),
    ('delivery hold', 'en', 'logistics', 'P1_HIGH', 'all'),

    -- Logistics & Customs (Spanish)
    ('carga retenida', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('embarque detenido', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('retenido en aduana', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('detenido por aduana', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('demora', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('estadías', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('almacenaje', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('reconocimiento aduanero', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('inspección física', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('corte de guía', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('corte de zarpe', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('liberación urgente', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('no entregar', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('detener entrega', 'es', 'logistics', 'P1_HIGH', 'all'),
    ('retención aduanera', 'es', 'logistics', 'P1_HIGH', 'all'),

    -- Critical Deadlines (English)
    ('urgent', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('asap', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('emergency', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('immediate attention', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('immediately', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('right now', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('today by', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('end of day today', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('eod today', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('before 5pm', 'en', 'deadline', 'P1_HIGH', 'all'),
    ('within 24 hours', 'en', 'deadline', 'P1_HIGH', 'all'),

    -- Critical Deadlines (Spanish)
    ('urgente', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('emergencia', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('de inmediato', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('ahora mismo', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('para hoy', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('hoy mismo', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('a más tardar hoy', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('antes del cierre', 'es', 'deadline', 'P1_HIGH', 'all'),
    ('en las próximas horas', 'es', 'deadline', 'P1_HIGH', 'all'),

    -- Legal (English)
    ('legal notice', 'en', 'legal', 'P1_HIGH', 'all'),
    ('breach of contract', 'en', 'legal', 'P1_HIGH', 'all'),
    ('service termination', 'en', 'legal', 'P1_HIGH', 'all'),
    ('lawsuit', 'en', 'legal', 'P1_HIGH', 'all'),
    ('fraud alert', 'en', 'legal', 'P1_HIGH', 'all'),

    -- Legal (Spanish)
    ('notificación legal', 'es', 'legal', 'P1_HIGH', 'all'),
    ('incumplimiento', 'es', 'legal', 'P1_HIGH', 'all'),
    ('cancelación de servicio', 'es', 'legal', 'P1_HIGH', 'all'),
    ('demanda', 'es', 'legal', 'P1_HIGH', 'all'),
    ('alerta de fraude', 'es', 'legal', 'P1_HIGH', 'all');
